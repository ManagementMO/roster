import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CoachStore, openCoachDb, TransformersEmbeddings } from "@rosterhq/coach";
import { defaultSkillSources, scanSkillSources } from "@rosterhq/playbook";
import { BackendManager, RosterServer, type RouterMode } from "@rosterhq/router";
import { coachDbPath } from "./paths.js";
import { loadConfig } from "./rosterfile.js";

/**
 * `roster serve` — run the router over stdio. FTS5 serves from second zero;
 * the dense rung warms in the background and is never awaited on the hot path.
 */
export async function serve(modeOverride?: RouterMode): Promise<void> {
  const config = loadConfig();
  const mode = modeOverride ?? config.mode;

  const store = new CoachStore(openCoachDb(coachDbPath()));
  const manager = new BackendManager();

  for (const [name, entry] of Object.entries(config.servers)) {
    if (!entry.command) {
      process.stderr.write(`roster: skipping "${name}" (url backends land post-launch; stdio only for now)\n`);
      continue;
    }
    try {
      await manager.connect({ name, command: entry.command, args: entry.args, env: entry.env });
    } catch (err) {
      process.stderr.write(
        `roster: backend "${name}" failed to connect: ${err instanceof Error ? err.message : err}\n`,
      );
    }
  }

  const skills = scanSkillSources([...config.skillSources, ...defaultSkillSources()]);

  let embedNeed: ((need: string) => Promise<Float32Array | null>) | undefined;
  if (config.embeddings === "auto" && !process.env.ROSTER_NO_FETCH) {
    embedNeed = makeLazyEmbedder(store, manager);
  }

  const roster = new RosterServer({ mode, manager, store, skills, embedNeed });
  roster.syncCapabilities();

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
function makeLazyEmbedder(
  store: CoachStore,
  manager: BackendManager,
): (need: string) => Promise<Float32Array | null> {
  let provider: TransformersEmbeddings | null = null;
  let warm = false;
  let warming: Promise<void> | null = null;

  const warmup = async (): Promise<void> => {
    if (!(await TransformersEmbeddings.isAvailable())) return;
    provider = new TransformersEmbeddings();
    await provider.embed(["roster warmup"]);
    // Backfill base vectors for everything we front (name + description + body).
    const entries = store.listCapabilities({ includeQuarantined: true });
    const texts = entries.map((e) => `${e.name}\n${e.description}\n${e.body ?? ""}`.slice(0, 2000));
    const vecs = await provider.embed(texts);
    entries.forEach((entry, i) => {
      const vec = vecs[i];
      if (vec) store.storeBaseVec(entry.id, vec);
    });
    void manager; // reserved for per-backend vec policies later
    warm = true;
  };

  return async (need: string) => {
    if (!warm) {
      warming ??= warmup().catch(() => {
        warming = null; // allow a later retry; lexical keeps serving meanwhile
      });
      return null;
    }
    if (!provider) return null;
    const [vec] = await provider.embed([need]);
    return vec ?? null;
  };
}
