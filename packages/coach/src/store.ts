import type {
  CapabilityEntry,
  OutcomeClass,
} from "@rosterhq/shared";
import { percentile, wilsonLowerBound } from "@rosterhq/shared";
import type { CoachDb } from "./db.js";
import { isAttributable } from "./classifier.js";
import { cosine, normalize, oatsAdjust } from "./oats.js";
import { blobToVec, sha256Hex, vecToBlob } from "./util.js";

export interface UpsertResult {
  added: string[];
  changed: string[];
  driftEvents: number;
}

export interface RecordOutcomeInput {
  session: string;
  source: string;
  capability: string;
  outcomeClass: OutcomeClass;
  latencyMs: number;
  needHash?: string | null;
  argsHash?: string | null;
  intentCategory?: string | null;
  substituted?: boolean;
  explored?: boolean;
  specVersion?: string | null;
  ts?: number;
}

export interface Candidate {
  entry: CapabilityEntry;
  score: number;
  lexScore: number | null;
  cosScore: number | null;
}

interface CapabilityRow {
  id: string;
  kind: "tool" | "skill";
  source: string;
  name: string;
  description: string;
  input_schema: string | null;
  output_schema: string | null;
  body: string | null;
  path: string | null;
  quarantined: number;
}

const SOFT_FAIL_LOOKBACK = 3;
const QUARANTINE_DWELL_MS = 24 * 3600 * 1000;
// Lab weight sweep (real MiniLM, 133-tool corpus, 66 ground-truthed needs):
// quality rises monotonically with cosine weight and plateaus near lex 0.1–0.15;
// 0.15/0.85 beat the former 0.3/0.7 on hit@1/hit@5/MRR, and a small retained
// lexical weight still beat pure cosine (it breaks ties on verbose/typo needs).
const HYBRID_LEX_WEIGHT = 0.15;
const HYBRID_COS_WEIGHT = 0.85;
// Cheap floor that guards ONLY degenerate tiny rosters. Honest scope (lab-
// measured): with a handful of tools MiniLM cosines span ~0.04 (noise), so the
// gate keeps dense from amplifying noise there. At realistic corpus scale it
// never fires (min observed span 0.22 across 66 needs / 133 tools) and it does
// NOT reject Gemma gibberish (whose noise spans also exceed 0.15) — it is a
// small-set safety floor, not a production noise filter. Do not oversell it.
const MIN_INFORMATIVE_COS_SPAN = 0.15;
/** Every genuine FTS hit keeps at least this score, so min-max never zeroes the
 *  worst real match out of a draft (which then displaced it with an unrelated
 *  rated tool — lab-measured on 87.6% of narrow needs). */
const LEX_SCORE_FLOOR = 0.05;

// Function words that carry no routing signal. Query tokens matching only these
// drove wrong-source tools into the visible top-5 for ~26% of needs (lab), incl.
// #1 slots (a stopword-dense description scoring bm25 1.0). Filtered from the
// QUERY only — never from the index — and only when content tokens survive.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "be",
  "my", "that", "this", "it", "its", "with", "as", "at", "by", "from", "into",
  "do", "does", "me", "we", "us", "your", "you", "i", "so", "if", "then",
]);

/**
 * Tokenize for lexical matching, splitting camelCase and letter/digit
 * boundaries so a name like `printEnv` or `getCurrentTime` is reachable by the
 * words `print env` / `current time` (unicode61 keeps camelCase as one token,
 * so these were previously unmatchable in both directions).
 */
function lexTokens(text: string): string[] {
  const spaced = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2");
  return spaced.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
}

/** FTS name-column text: source + raw name + camelCase-split subwords. */
function ftsNameText(source: string, name: string): string {
  return `${source} ${name} ${lexTokens(name).join(" ")}`;
}

export function defHash(entry: CapabilityEntry): string {
  return sha256Hex(
    JSON.stringify({
      name: entry.name,
      description: entry.description,
      inputSchema: entry.inputSchema ?? null,
      // outputSchema is part of a tool's contract: a change to it is drift.
      // Runtime output validation can't catch it (the MCP SDK validates and
      // throws before the router sees the result), so connect-time hashing is
      // the ONLY place output-schema drift is detectable.
      outputSchema: entry.outputSchema ?? null,
      body: entry.body ?? null,
    }),
  );
}

export class CoachStore {
  // Initialized in the constructor BODY: with ES2022 class fields, field
  // initializers run before parameter-property assignment — `this.db` would
  // still be undefined here.
  private activeCapabilityStmt!: ReturnType<CoachDb["prepare"]>;

  constructor(private readonly db: CoachDb) {
    this.activeCapabilityStmt = this.db.prepare(
      `SELECT id, kind, source, name, description, input_schema, output_schema, body, path, quarantined
       FROM capability WHERE id = ? AND quarantined = 0`,
    );
  }

  // ── maintenance (the nightly job) ─────────────────────────────────────────

  private getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT INTO meta(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(key, value);
  }

  /**
   * The nightly job, run opportunistically at serve boot: recompute ratings
   * from logged outcomes and refine tool vectors (OATS). Debounced by
   * `intervalMs` so frequent client restarts don't thrash. Returns what ran.
   * This is what makes the README's "learns from outcomes" true at runtime.
   */
  runMaintenanceIfDue(intervalMs = 20 * 3600 * 1000, now = Date.now()): {
    ran: boolean;
    oats?: { adjusted: number; skipped: number };
  } {
    const last = Number(this.getMeta("last_maintenance") ?? 0);
    if (now - last < intervalMs) return { ran: false };
    this.recomputeRatings("all", now);
    const oats = this.runOats(now);
    this.setMeta("last_maintenance", String(now));
    return { ran: true, oats };
  }

  // ── capabilities ────────────────────────────────────────────────────────

  upsertCapabilities(entries: readonly CapabilityEntry[], now = Date.now()): UpsertResult {
    const result: UpsertResult = { added: [], changed: [], driftEvents: 0 };
    const getExisting = this.db.prepare("SELECT id, def_hash FROM capability WHERE id = ?");
    const insert = this.db.prepare(`
      INSERT INTO capability(id, kind, source, name, description, input_schema, output_schema,
        body, path, def_hash, quarantined, first_seen, last_seen)
      VALUES(@id, @kind, @source, @name, @description, @input_schema, @output_schema,
        @body, @path, @def_hash, 0, @now, @now)
    `);
    const update = this.db.prepare(`
      UPDATE capability SET kind=@kind, source=@source, name=@name, description=@description,
        input_schema=@input_schema, output_schema=@output_schema, body=@body, path=@path,
        def_hash=@def_hash, quarantined=@quarantined, last_seen=@now
      WHERE id=@id
    `);
    const touch = this.db.prepare("UPDATE capability SET last_seen=? WHERE id=?");
    const drift = this.db.prepare(
      "INSERT INTO drift_event(ts, capability, old_hash, new_hash) VALUES(?,?,?,?)",
    );
    const ftsDelete = this.db.prepare("DELETE FROM capability_fts WHERE id = ?");
    const ftsInsert = this.db.prepare(
      "INSERT INTO capability_fts(id, name, description, body) VALUES(?,?,?,?)",
    );
    // Drift invalidates the stored vector: the embedding derives from the def
    // text, so a changed def means a stale base — and the warm-boot backfill
    // now SKIPS ids that still have a vec row (D4), which would otherwise pin
    // the stale embedding forever (round-4b self-review). Deleting the row is
    // lossless: base re-embeds at the next warmup, and adj is fully derived —
    // the next nightly OATS regenerates it from the outcome history (this also
    // drops the old-semantics "adj ghost" the drift-sim charter flagged).
    const vecDelete = this.db.prepare("DELETE FROM vec WHERE capability = ?");
    const getTombstone = this.db.prepare(
      "SELECT def_hash, quarantined, last_drift_ts FROM removed_capability WHERE id = ?",
    );
    const deleteTombstone = this.db.prepare("DELETE FROM removed_capability WHERE id = ?");
    const setQuarantined = this.db.prepare("UPDATE capability SET quarantined = 1 WHERE id = ?");

    const run = this.db.transaction(() => {
      for (const entry of entries) {
        const hash = defHash(entry);
        const row = getExisting.get(entry.id) as { id: string; def_hash: string } | undefined;
        const params = {
          id: entry.id,
          kind: entry.kind,
          source: entry.source,
          name: entry.name,
          description: entry.description,
          input_schema: entry.inputSchema ? JSON.stringify(entry.inputSchema) : null,
          output_schema: entry.outputSchema ? JSON.stringify(entry.outputSchema) : null,
          body: entry.body ?? null,
          path: entry.path ?? null,
          def_hash: hash,
          now,
        };
        if (!row) {
          insert.run(params);
          // Source name is part of the lexical surface: "memory" must find
          // memory__* tools even when descriptions never say the word; and
          // camelCase names are split so `print env` reaches `printEnv`.
          ftsInsert.run(entry.id, ftsNameText(entry.source, entry.name), entry.description, entry.body ?? "");
          // Remove/re-add drift guard: if this id was pruned before, its
          // tombstone carries the last-seen hash. A CHANGED definition on return
          // is drift (quarantine + event) — it must not slip back in as "new".
          // An UNCHANGED return that was still mid-dwell stays quarantined.
          const tomb = getTombstone.get(entry.id) as
            | { def_hash: string; quarantined: number; last_drift_ts: number | null }
            | undefined;
          if (tomb) {
            deleteTombstone.run(entry.id);
            if (tomb.def_hash !== hash) {
              drift.run(now, entry.id, tomb.def_hash, hash);
              setQuarantined.run(entry.id);
              result.changed.push(entry.id);
              result.driftEvents += 1;
            } else {
              if (
                tomb.quarantined === 1 &&
                tomb.last_drift_ts !== null &&
                now - tomb.last_drift_ts < QUARANTINE_DWELL_MS
              ) {
                setQuarantined.run(entry.id); // preserve an interrupted dwell
              }
              result.added.push(entry.id);
            }
          } else {
            result.added.push(entry.id);
          }
        } else if (row.def_hash !== hash) {
          // Definition drifted: record the event and quarantine from default rosters.
          drift.run(now, entry.id, row.def_hash, hash);
          update.run({ ...params, quarantined: 1 });
          ftsDelete.run(entry.id);
          ftsInsert.run(entry.id, ftsNameText(entry.source, entry.name), entry.description, entry.body ?? "");
          vecDelete.run(entry.id);
          result.changed.push(entry.id);
          result.driftEvents += 1;
        } else {
          // Stable re-sight of the SAME definition clears an earlier quarantine —
          // but only after a dwell period: fresh serves happen minutes apart, and
          // a drift alarm that clears in minutes protects nobody.
          const lastDrift = this.db
            .prepare("SELECT ts FROM drift_event WHERE capability = ? ORDER BY id DESC LIMIT 1")
            .get(entry.id) as { ts: number } | undefined;
          const dwellOver = !lastDrift || now - lastDrift.ts >= QUARANTINE_DWELL_MS;
          if (dwellOver) {
            this.db
              .prepare("UPDATE capability SET quarantined = 0, last_seen = ? WHERE id = ?")
              .run(now, entry.id);
          } else {
            touch.run(now, entry.id);
          }
        }
      }
    });
    run.immediate();
    return result;
  }

  /**
   * Model-switch guard: OATS-adjusted vectors and cached need vectors are only
   * meaningful in the embedding space they were computed in. When the active
   * model changes (RAM boundary crossed, DB moved between machines), stale
   * `adj` blobs would otherwise be read at the new dims — silently poisoning
   * exactly the best-learned tools. Call before any backfill.
   */
  ensureEmbeddingModel(modelId: string): { switched: boolean } {
    const prev = this.getMeta("embedding_model");
    if (prev === modelId) return { switched: false };
    const run = this.db.transaction(() => {
      if (prev !== null) {
        this.db.prepare("UPDATE vec SET adj = NULL").run();
        this.db.prepare("DELETE FROM need_vec").run();
      }
      this.setMeta("embedding_model", modelId);
    });
    run.immediate();
    return { switched: prev !== null };
  }

  listCapabilities(opts: { includeQuarantined?: boolean; kind?: "tool" | "skill" } = {}): CapabilityEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, kind, source, name, description, input_schema, output_schema, body, path, quarantined
         FROM capability
         WHERE (@includeQuarantined = 1 OR quarantined = 0)
           AND (@kind IS NULL OR kind = @kind)
         ORDER BY id`,
      )
      .all({
        includeQuarantined: opts.includeQuarantined ? 1 : 0,
        kind: opts.kind ?? null,
      }) as CapabilityRow[];
    return rows.map(rowToEntry);
  }

  getCapability(id: string): CapabilityEntry | null {
    const row = this.db
      .prepare(
        `SELECT id, kind, source, name, description, input_schema, output_schema, body, path, quarantined
         FROM capability WHERE id = ?`,
      )
      .get(id) as CapabilityRow | undefined;
    return row ? rowToEntry(row) : null;
  }

  /** Draft-path lookup: quarantined capabilities never enter a roster. */
  private activeCapability(id: string): CapabilityEntry | null {
    const row = this.activeCapabilityStmt.get(id) as CapabilityRow | undefined;
    return row ? rowToEntry(row) : null;
  }

  /**
   * Remove capabilities that no longer exist upstream (server removed, skill
   * deleted). Vectors and FTS rows go with them; outcome history is kept.
   */
  pruneMissing(
    presentIds: ReadonlySet<string>,
    protectedSources: ReadonlySet<string> = new Set(),
    opts: { keepSeenSince?: number; now?: number } = {},
  ): string[] {
    const now = opts.now ?? Date.now();
    const all = this.db
      .prepare("SELECT id, source, last_seen, def_hash, quarantined FROM capability")
      .all() as Array<{
      id: string;
      source: string;
      last_seen: number;
      def_hash: string;
      quarantined: number;
    }>;
    // protectedSources: backends CONFIGURED but unreachable this boot — a
    // transient outage must never delete learned vectors or the drift baseline.
    // keepSeenSince: rows another process upserted while WE were booting (its
    // config is newer than the one we read) also survive — without this, a
    // freshly-synced server's state could be pruned by a sibling serve racing
    // on a stale roster.json.
    const keepSince = opts.keepSeenSince ?? Number.POSITIVE_INFINITY;
    // A stored source may carry a "-N" collision suffix its config name never
    // had, so protection matches the exact source AND its de-suffixed base —
    // otherwise an unavailable backend's learned state is pruned despite being
    // protected (over-protection is the safe direction: keep, never wrongly delete).
    const deSuffix = (source: string): string => source.replace(/-\d+$/, "");
    const gone = all.filter(
      (r) =>
        !presentIds.has(r.id) &&
        !protectedSources.has(r.source) &&
        !protectedSources.has(deSuffix(r.source)) &&
        r.last_seen < keepSince,
    );
    const run = this.db.transaction(() => {
      const delCap = this.db.prepare("DELETE FROM capability WHERE id = ?");
      const delFts = this.db.prepare("DELETE FROM capability_fts WHERE id = ?");
      const delVec = this.db.prepare("DELETE FROM vec WHERE capability = ?");
      const lastDriftStmt = this.db.prepare(
        "SELECT ts FROM drift_event WHERE capability = ? ORDER BY id DESC LIMIT 1",
      );
      // Tombstone the definition BEFORE deleting, so a later re-add with a
      // changed def is recognized as drift (not a fresh tool).
      const tombstone = this.db.prepare(
        `INSERT OR REPLACE INTO removed_capability(id, def_hash, quarantined, last_drift_ts, removed_at)
         VALUES(?,?,?,?,?)`,
      );
      for (const r of gone) {
        const ld = lastDriftStmt.get(r.id) as { ts: number } | undefined;
        tombstone.run(r.id, r.def_hash, r.quarantined, ld?.ts ?? null, now);
        delCap.run(r.id);
        delFts.run(r.id);
        delVec.run(r.id);
      }
    });
    run();
    return gone.map((r) => r.id);
  }

  /** Sixth Man field data: every suggestion is logged; `taken` flips when the agent follows it. */
  recordSuggestion(session: string, failed: string, suggested: string, now = Date.now()): void {
    this.db
      .prepare(
        "INSERT INTO suggestion(ts, session, failed_capability, suggested_capability) VALUES(?,?,?,?)",
      )
      .run(now, session, failed, suggested);
  }

  private markSuggestionTaken(session: string, capability: string): void {
    this.db
      .prepare(
        `UPDATE suggestion SET taken = 1 WHERE id = (
           SELECT id FROM suggestion WHERE session = ? AND suggested_capability = ? AND taken = 0
           ORDER BY id DESC LIMIT 1)`,
      )
      .run(session, capability);
  }

  clearQuarantine(id: string): void {
    this.db.prepare("UPDATE capability SET quarantined = 0 WHERE id = ?").run(id);
  }

  driftEvents(): Array<{ ts: number; capability: string; oldHash: string; newHash: string }> {
    return (
      this.db
        .prepare("SELECT ts, capability, old_hash, new_hash FROM drift_event ORDER BY id DESC")
        .all() as Array<{ ts: number; capability: string; old_hash: string; new_hash: string }>
    ).map((r) => ({ ts: r.ts, capability: r.capability, oldHash: r.old_hash, newHash: r.new_hash }));
  }

  // ── outcomes ────────────────────────────────────────────────────────────

  recordOutcome(input: RecordOutcomeInput): number {
    const ts = input.ts ?? Date.now();
    const insert = this.db.prepare(`
      INSERT INTO outcome(ts, session, source, capability, need_hash, args_hash, intent_cat,
        class, latency_ms, soft_fail, substituted, explored, spec_ver)
      VALUES(@ts, @session, @source, @capability, @need_hash, @args_hash, @intent_cat,
        @class, @latency_ms, 0, @substituted, @explored, @spec_ver)
    `);
    const info = insert.run({
      ts,
      session: input.session,
      source: input.source,
      capability: input.capability,
      need_hash: input.needHash ?? null,
      args_hash: input.argsHash ?? null,
      intent_cat: input.intentCategory ?? null,
      class: input.outcomeClass,
      latency_ms: Math.max(0, Math.round(input.latencyMs)),
      substituted: input.substituted ? 1 : 0,
      explored: input.explored ? 1 : 0,
      spec_ver: input.specVersion ?? null,
    });
    const id = Number(info.lastInsertRowid);
    this.markSoftFailIfRetry(id, input);
    this.markSuggestionTaken(input.session, input.capability);
    return id;
  }

  /**
   * Handoff §6.2 rule 4 (amended 2026-07-07 after the deep-review audit): a
   * re-call of the same capability with *different* args marks the PRIOR attempt
   * soft_fail — BUT only when that prior attempt did NOT succeed. The original
   * rule marked any prior call, which conflated the "retried because the result
   * was unusable" signal with the DOMINANT agent pattern of iterating one tool
   * over different inputs (read 5 files, list 5 dirs). Empirically that discarded
   * ~4 of 5 legitimate successes and starved OATS's positive corpus. A genuine
   * success is never retroactively downgraded; a prior FAILURE followed by an
   * adjusted-args retry is still excluded (MCP-Atlas fairness: don't blame the
   * tool for what may be the caller's first bad args). Distinguishing iteration
   * from dissatisfaction on two successes needs an end-of-task signal we don't
   * yet have (§6.2 item 5); until then, a success counts as a success.
   */
  private markSoftFailIfRetry(currentId: number, input: RecordOutcomeInput): void {
    if (!input.argsHash) return;
    const recent = this.db
      .prepare(
        `SELECT id, capability, args_hash, class FROM outcome
         WHERE session = ? AND id < ? ORDER BY id DESC LIMIT ?`,
      )
      .all(input.session, currentId, SOFT_FAIL_LOOKBACK) as Array<{
      id: number;
      capability: string;
      args_hash: string | null;
      class: OutcomeClass;
    }>;
    const prior = recent.find(
      (r) =>
        r.capability === input.capability &&
        r.args_hash !== null &&
        r.args_hash !== input.argsHash &&
        r.class !== "success",
    );
    if (prior) {
      this.db.prepare("UPDATE outcome SET soft_fail = 1 WHERE id = ?").run(prior.id);
    }
  }

  // ── ratings ─────────────────────────────────────────────────────────────

  /**
   * Ratings use only attributable, non-explored, non-soft-fail rows (§6.2).
   * Percentile latencies come from successful calls: they describe how the
   * capability performs when it works.
   */
  recomputeRatings(category = "all", now = Date.now()): void {
    // category != "all" must aggregate ONLY that intent category's outcomes —
    // otherwise every capability's global stats get written under the requested
    // label, fabricating an entire fake per-category leaderboard.
    const rows = (
      category === "all"
        ? this.db.prepare(
            `SELECT capability, class, latency_ms FROM outcome
             WHERE explored = 0 AND soft_fail = 0`,
          ).all()
        : this.db.prepare(
            `SELECT capability, class, latency_ms FROM outcome
             WHERE explored = 0 AND soft_fail = 0 AND intent_cat = ?`,
          ).all(category)
    ) as Array<{ capability: string; class: OutcomeClass; latency_ms: number }>;

    const byCap = new Map<string, { n: number; successes: number; latencies: number[] }>();
    for (const row of rows) {
      if (!isAttributable(row.class)) continue;
      let agg = byCap.get(row.capability);
      if (!agg) {
        agg = { n: 0, successes: 0, latencies: [] };
        byCap.set(row.capability, agg);
      }
      agg.n += 1;
      if (row.class === "success") {
        agg.successes += 1;
        agg.latencies.push(row.latency_ms);
      }
    }

    const upsert = this.db.prepare(`
      INSERT INTO rating(capability, category, n, successes, wilson_lb, p50_ms, p95_ms, updated_at)
      VALUES(@capability, @category, @n, @successes, @wilson_lb, @p50, @p95, @now)
      ON CONFLICT(capability, category) DO UPDATE SET
        n=@n, successes=@successes, wilson_lb=@wilson_lb, p50_ms=@p50, p95_ms=@p95, updated_at=@now
    `);
    // Ratings must not outlive their evidence: a capability whose attributable
    // outcomes all vanished (deleted, or all became soft_fail/explored) keeps a
    // stale rating that still ranks it in the fallback. Drop rows for this
    // category that no longer have any attributable evidence.
    const existing = this.db
      .prepare("SELECT capability FROM rating WHERE category = ?")
      .all(category) as Array<{ capability: string }>;
    const deleteRating = this.db.prepare("DELETE FROM rating WHERE capability = ? AND category = ?");
    const run = this.db.transaction(() => {
      for (const { capability } of existing) {
        if (!byCap.has(capability)) deleteRating.run(capability, category);
      }
      for (const [capability, agg] of byCap) {
        const sorted = [...agg.latencies].sort((a, b) => a - b);
        upsert.run({
          capability,
          category,
          n: agg.n,
          successes: agg.successes,
          wilson_lb: wilsonLowerBound(agg.successes, agg.n),
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          now,
        });
      }
    });
    run();
  }

  getRating(capability: string, category = "all"): {
    n: number;
    successes: number;
    wilsonLb: number;
    p50Ms: number | null;
    p95Ms: number | null;
  } | null {
    const row = this.db
      .prepare(
        "SELECT n, successes, wilson_lb, p50_ms, p95_ms FROM rating WHERE capability=? AND category=?",
      )
      .get(capability, category) as
      | { n: number; successes: number; wilson_lb: number; p50_ms: number | null; p95_ms: number | null }
      | undefined;
    if (!row) return null;
    return {
      n: row.n,
      successes: row.successes,
      wilsonLb: row.wilson_lb,
      p50Ms: row.p50_ms,
      p95Ms: row.p95_ms,
    };
  }

  // ── retrieval ladder ────────────────────────────────────────────────────

  /** Rung 1: FTS5/BM25 — instant, zero-download. */
  lexicalSearch(need: string, k = 30): Array<{ id: string; lexScore: number }> {
    const all = [...new Set(lexTokens(need))];
    // Drop function words that only add noise — but if the need is ALL
    // stopwords, keep them rather than return nothing.
    const content = all.filter((t) => !STOPWORDS.has(t));
    const tokens = content.length > 0 ? content : all;
    if (tokens.length === 0) return [];
    const match = tokens.map((t) => `"${t}"`).join(" OR ");
    try {
      const rows = this.db
        .prepare(
          `SELECT id, bm25(capability_fts) AS rank FROM capability_fts
           WHERE capability_fts MATCH ? ORDER BY rank LIMIT ?`,
        )
        .all(match, k) as Array<{ id: string; rank: number }>;
      if (rows.length === 0) return [];
      // bm25(): lower is better (negative). Normalize to [0,1], best = 1.
      // NB: no `|| 1` shortcuts here — that bug once promoted the WORST
      // match to a perfect score and corrupted every lexical draft.
      const ranks = rows.map((r) => r.rank);
      const best = Math.min(...ranks);
      const worst = Math.max(...ranks);
      const span = worst - best;
      // Map into [LEX_SCORE_FLOOR, 1], not [0, 1]: the worst of N genuine matches
      // is still a real match and must survive the `score > 0` draft filter.
      return rows.map((r) => ({
        id: r.id,
        lexScore: span === 0 ? 1 : LEX_SCORE_FLOOR + (1 - LEX_SCORE_FLOOR) * ((worst - r.rank) / span),
      }));
    } catch {
      return []; // malformed MATCH input must never break a draft
    }
  }

  /**
   * Rung 2 fusion: 0.15·lexical + 0.85·cosine when a need vector is available.
   * Quarantined capabilities never enter a roster.
   */
  draftCandidates(need: string, k: number, needVec?: Float32Array | null): Candidate[] {
    const lexical = this.lexicalSearch(need, Math.max(30, k * 6));
    const lexById = new Map(lexical.map((l) => [l.id, l.lexScore]));

    const vecs = needVec ? this.loadVecs() : new Map<string, Float32Array>();
    const candidateIds = new Set<string>(lexById.keys());
    if (needVec) for (const id of vecs.keys()) candidateIds.add(id);

    // Pass 1: gather raw signals.
    const gathered: Array<{ entry: CapabilityEntry; lexScore: number | null; cosScore: number | null }> = [];
    for (const id of candidateIds) {
      const entry = this.activeCapability(id);
      if (!entry) continue; // quarantined or removed
      const lexScore = lexById.get(id) ?? null;
      let cosScore: number | null = null;
      if (needVec) {
        const v = vecs.get(id);
        if (v && v.length === needVec.length) cosScore = cosine(needVec, v);
      }
      gathered.push({ entry, lexScore, cosScore });
    }

    // Pass 2: fuse. The cosine channel is min-max normalized WITHIN the
    // candidate set (raw (cos+1)/2 made every vec-bearing tool score ~0.35 and
    // turned the intended blend into ~10/90, live-measured). The span-abstain
    // guard below only engages on degenerate tiny rosters (see
    // MIN_INFORMATIVE_COS_SPAN); at realistic scale the dense channel governs
    // every draft, which is what the lab retrieval numbers want.
    const cosVals = gathered.map((g) => g.cosScore).filter((c): c is number => c !== null);
    const cosMin = cosVals.length > 0 ? Math.min(...cosVals) : 0;
    const cosSpan = cosVals.length > 0 ? Math.max(...cosVals) - cosMin : 0;
    const denseInformative = cosVals.length > 1 && cosSpan >= MIN_INFORMATIVE_COS_SPAN;
    const out: Candidate[] = [];
    for (const g of gathered) {
      let score: number;
      if (needVec && denseInformative && g.cosScore !== null) {
        const cosNorm = (g.cosScore - cosMin) / cosSpan;
        score = HYBRID_LEX_WEIGHT * (g.lexScore ?? 0) + HYBRID_COS_WEIGHT * cosNorm;
      } else {
        score = g.lexScore ?? 0;
      }
      if (score > 0) out.push({ entry: g.entry, score, lexScore: g.lexScore, cosScore: g.cosScore });
    }
    out.sort((a, b) => b.score - a.score);
    if (out.length >= k) return out.slice(0, k);

    // Graceful fallback: in pure-lexical mode a paraphrased need ("remember a
    // fact" vs a tool named create_entities) can share no tokens and return
    // nothing. A draft must never come back empty when capabilities exist —
    // backfill by rating (proven performers first), then by recency. Dense
    // routing supersedes this once the embedding model warms.
    const have = new Set(out.map((c) => c.entry.id));
    for (const entry of this.ratedFallback(k - out.length, have)) {
      out.push({ entry, score: 0, lexScore: null, cosScore: null });
    }
    return out.slice(0, k);
  }

  private ratedFallback(limit: number, exclude: ReadonlySet<string>): CapabilityEntry[] {
    const rows = this.db
      .prepare(
        `SELECT c.id FROM capability c
         LEFT JOIN rating r ON r.capability = c.id AND r.category = 'all'
         WHERE c.quarantined = 0
         ORDER BY COALESCE(r.wilson_lb, 0) DESC, c.last_seen DESC
         LIMIT ?`,
      )
      .all(Math.max(limit + exclude.size, limit)) as Array<{ id: string }>;
    const out: CapabilityEntry[] = [];
    for (const row of rows) {
      if (exclude.has(row.id)) continue;
      const entry = this.activeCapability(row.id);
      if (entry) out.push(entry);
      if (out.length >= limit) break;
    }
    return out;
  }

  // ── vectors & OATS ──────────────────────────────────────────────────────

  storeBaseVec(capability: string, vec: Float32Array, now = Date.now()): void {
    const normalized = normalize(vec);
    this.db
      .prepare(
        `INSERT INTO vec(capability, dims, base, adj, updated_at) VALUES(?,?,?,NULL,?)
         ON CONFLICT(capability) DO UPDATE SET
           -- a dims change means a different embedding space: the old adj is
           -- meaningless there and must not survive the base rewrite
           adj = CASE WHEN vec.dims != excluded.dims THEN NULL ELSE vec.adj END,
           dims = excluded.dims, base = excluded.base, updated_at = excluded.updated_at`,
      )
      .run(capability, normalized.length, vecToBlob(normalized), now);
  }

  storeNeedVec(needHash: string, vec: Float32Array, now = Date.now()): void {
    const normalized = normalize(vec);
    this.db
      .prepare(
        `INSERT INTO need_vec(need_hash, dims, vec, ts) VALUES(?,?,?,?)
         ON CONFLICT(need_hash) DO UPDATE SET dims=excluded.dims, vec=excluded.vec, ts=excluded.ts`,
      )
      .run(needHash, normalized.length, vecToBlob(normalized), now);
  }

  /** Ids that already have a stored vector (same model, post model-switch guard) —
   *  lets warm boots skip re-embedding what's already there instead of re-doing
   *  the whole roster every serve process (audit D4). */
  vecCapabilityIds(): Set<string> {
    const rows = this.db.prepare("SELECT capability FROM vec").all() as Array<{ capability: string }>;
    return new Set(rows.map((r) => r.capability));
  }

  /** adj if present, else base — the vector drafts actually use. */
  loadVecs(): Map<string, Float32Array> {
    const rows = this.db
      .prepare("SELECT capability, dims, base, adj FROM vec")
      .all() as Array<{ capability: string; dims: number; base: Buffer; adj: Buffer | null }>;
    const map = new Map<string, Float32Array>();
    for (const row of rows) {
      try {
        map.set(row.capability, blobToVec(row.adj ?? row.base, row.dims));
      } catch {
        // Length-mismatched blob (pre-guard data): drop from dense; the next
        // warmup backfill rewrites it in the active model's space.
      }
    }
    return map;
  }

  /**
   * Nightly OATS (§6.2). Positives: need vectors where the capability succeeded.
   * Negatives: need vectors where it was called and failed attributably — a
   * conservative superset of the paper's "ranked #1 but failed" (we know these
   * needs actually reached the tool). Window 90 days, cap 500 per side.
   */
  runOats(now = Date.now()): { adjusted: number; skipped: number } {
    const since = now - 90 * 24 * 3600 * 1000;
    const caps = this.db.prepare("SELECT capability, dims, base FROM vec").all() as Array<{
      capability: string;
      dims: number;
      base: Buffer;
    }>;
    const needVecStmt = this.db.prepare("SELECT dims, vec FROM need_vec WHERE need_hash = ?");
    // Caps are PER SIDE: one shared limit let a chatty failing tool fill the
    // whole window and starve positives, freezing its adjustment forever.
    const positivesStmt = this.db.prepare(
      `SELECT need_hash, class FROM outcome
       WHERE capability = ? AND ts >= ? AND need_hash IS NOT NULL
         AND explored = 0 AND soft_fail = 0 AND class = 'success'
       ORDER BY ts DESC LIMIT 500`,
    );
    const negativesStmt = this.db.prepare(
      `SELECT need_hash, class FROM outcome
       WHERE capability = ? AND ts >= ? AND need_hash IS NOT NULL
         AND explored = 0 AND soft_fail = 0 AND class != 'success'
       ORDER BY ts DESC LIMIT 500`,
    );

    let adjusted = 0;
    let skipped = 0;
    const writeAdj = this.db.prepare("UPDATE vec SET adj = ?, updated_at = ? WHERE capability = ?");

    for (const cap of caps) {
      const rows = [
        ...(positivesStmt.all(cap.capability, since) as Array<{ need_hash: string; class: OutcomeClass }>),
        ...(negativesStmt.all(cap.capability, since) as Array<{ need_hash: string; class: OutcomeClass }>),
      ];
      const positives: Float32Array[] = [];
      const negatives: Float32Array[] = [];
      for (const row of rows) {
        const nv = needVecStmt.get(row.need_hash) as { dims: number; vec: Buffer } | undefined;
        if (!nv || nv.dims !== cap.dims) continue;
        const vec = blobToVec(nv.vec, nv.dims);
        if (row.class === "success") positives.push(vec);
        else if (isAttributable(row.class)) negatives.push(vec);
      }
      const base = blobToVec(cap.base, cap.dims);
      const result = oatsAdjust(base, positives, negatives);
      if (result.applied) {
        writeAdj.run(vecToBlob(result.vec), now, cap.capability);
        adjusted += 1;
      } else {
        skipped += 1;
      }
    }
    return { adjusted, skipped };
  }
}

function rowToEntry(row: CapabilityRow): CapabilityEntry {
  return {
    id: row.id,
    kind: row.kind,
    source: row.source,
    name: row.name,
    description: row.description,
    inputSchema: row.input_schema ? (JSON.parse(row.input_schema) as Record<string, unknown>) : undefined,
    outputSchema: row.output_schema
      ? (JSON.parse(row.output_schema) as Record<string, unknown>)
      : undefined,
    body: row.body ?? undefined,
    path: row.path ?? undefined,
  };
}
