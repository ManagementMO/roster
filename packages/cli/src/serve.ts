import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CoachStore, openCoachDb, TransformersEmbeddings } from "@rosterhq/coach";
import { normalizeBackendName } from "@rosterhq/shared";
import { defaultSkillSources, scanSkillSources } from "@rosterhq/playbook";
import { BackendManager, RosterServer, type RouterMode } from "@rosterhq/router";
import { coachDbPath, homeDir } from "./paths.js";
import { loadConfig } from "./rosterfile.js";

/**
 * `roster serve` — run the router over stdio. FTS5 serves from second zero;
 * the dense rung warms in the background and is never awaited on the hot path.
 */
export async function serve(modeOverride?: RouterMode): Promise<void> {
  const bootStarted = Date.now();
  const config = loadConfig();
  const mode = modeOverride ?? config.mode;

  const store = new CoachStore(openCoachDb(coachDbPath()));
  const manager = new BackendManager();

  // Protect under the SAME key the router stores capabilities: normalizeBackendName
  // (sanitize + reserved-word rename), not raw sanitizeSource. The mismatch made
  // a backend configured as e.g. "skill" (stored as skill-server__*) lose ALL its
  // learned state on its first unavailable boot despite the "preserved" promise.
  const unavailable = new Set<string>();
  for (const [name, entry] of Object.entries(config.servers)) {
    if (!entry.command) {
      process.stderr.write(`roster: skipping "${name}" (url backends land post-launch; stdio only for now)\n`);
      unavailable.add(normalizeBackendName(name));
      continue;
    }
    try {
      await manager.connect({ name, command: entry.command, args: entry.args, env: entry.env });
    } catch (err) {
      unavailable.add(normalizeBackendName(name));
      process.stderr.write(
        `roster: backend "${name}" failed to connect (its learned state is preserved): ${err instanceof Error ? err.message : err}\n`,
      );
    }
  }

  // homeDir() honors ROSTER_TEST_HOME so serve stays hermetic under test.
  const skills = scanSkillSources([
    ...config.skillSources,
    ...defaultSkillSources({ home: homeDir() }),
  ]);

  let embedNeed: ((need: string) => Promise<Float32Array | null>) | undefined;
  if (config.embeddings === "auto" && !process.env.ROSTER_NO_FETCH) {
    embedNeed = makeLazyEmbedder(store);
  }

  const roster = new RosterServer({ mode, manager, store, skills, embedNeed });
  try {
    // keepSeenSince: rows a sibling serve touched during OUR boot window are
    // never pruned — its roster.json may be newer than the one we read.
    roster.syncCapabilities(unavailable, bootStarted);
  } catch (err) {
    // A capability-index hiccup (e.g. rare write contention) must degrade,
    // not kill the router the client just launched.
    process.stderr.write(
      `roster: capability sync failed (serving with existing index): ${err instanceof Error ? err.message : err}\n`,
    );
  }

  // The nightly job, run opportunistically at boot (debounced ~20h): recompute
  // ratings and refine routing vectors from logged outcomes. This is the Coach
  // actually learning — without it, ratings stay empty and OATS never fires.
  try {
    const maint = store.runMaintenanceIfDue();
    if (maint.ran && maint.oats) {
      process.stderr.write(`roster: refreshed routing (${maint.oats.adjusted} tools tuned from your outcomes)\n`);
    }
  } catch (err) {
    process.stderr.write(`roster: maintenance skipped: ${err instanceof Error ? err.message : err}\n`);
  }

  const transport = new StdioServerTransport();
  await roster.server.connect(transport);
  process.stderr.write(
    `roster: serving ${manager.allTools().length} tool(s) + ${skills.length} skill(s) in ${mode} mode\n`,
  );
}

/**
 * Dense-rung wiring. The first draft kicks a background warmup (model fetch on
 * first ever run); drafts return lexical results (null vector) until warm.
 * Nothing here can ever block or fail a draft.
 */
const WARMUP_MAX_ATTEMPTS = 3;
const WARMUP_RETRY_BACKOFF_MS = 60_000;

function makeLazyEmbedder(
  store: CoachStore,
): (need: string) => Promise<Float32Array | null> {
  // ONE provider for the process: a fresh instance per retry would restart the
  // full model download on flaky networks — once per draft, forever.
  let provider: TransformersEmbeddings | null = null;
  let warm = false;
  let warming: Promise<void> | null = null;
  let attempts = 0;
  let nextRetryAt = 0;

  const warmup = async (): Promise<void> => {
    if (!(await TransformersEmbeddings.isAvailable())) {
      attempts = WARMUP_MAX_ATTEMPTS; // package absent: no point retrying
      return;
    }
    provider ??= new TransformersEmbeddings();
    await provider.embed(["roster warmup"]);
    // Model-switch guard: stale OATS vectors from a different embedding space
    // are wiped before we backfill in this one.
    store.ensureEmbeddingModel(provider.modelId);
    // Backfill base vectors only for what's NOT already embedded in this model's
    // space — a warm coach.db then re-embeds nothing (the model-switch guard
    // above already wiped vecs if the model changed), instead of re-doing the
    // whole roster every serve process (audit D4). Chunked so a big roster
    // can't spike RAM or starve the queue for the first live draft.
    const alreadyEmbedded = store.vecCapabilityIds();
    const entries = store
      .listCapabilities({ includeQuarantined: true })
      .filter((e) => !alreadyEmbedded.has(e.id));
    const BATCH = 16;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      const texts = batch.map((e) => `${e.name}\n${e.description}\n${e.body ?? ""}`.slice(0, 2000));
      const vecs = await provider.embed(texts, "document");
      batch.forEach((entry, j) => {
        const vec = vecs[j];
        if (vec) store.storeBaseVec(entry.id, vec);
      });
    }
    warm = true;
  };

  return async (need: string) => {
    if (!warm) {
      if (warming === null && attempts < WARMUP_MAX_ATTEMPTS && Date.now() >= nextRetryAt) {
        attempts += 1;
        warming = warmup()
          .catch(() => {
            nextRetryAt = Date.now() + WARMUP_RETRY_BACKOFF_MS;
          })
          .finally(() => {
            if (!warm) warming = null; // allow the next (bounded) retry
          });
      }
      return null; // lexical keeps serving; a draft never waits on warmup
    }
    if (!provider) return null;
    const [vec] = await provider.embed([need], "query");
    return vec ?? null;
  };
}
