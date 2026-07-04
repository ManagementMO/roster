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
const HYBRID_LEX_WEIGHT = 0.3;
const HYBRID_COS_WEIGHT = 0.7;

export function defHash(entry: CapabilityEntry): string {
  return sha256Hex(
    JSON.stringify({
      name: entry.name,
      description: entry.description,
      inputSchema: entry.inputSchema ?? null,
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
          // memory__* tools even when descriptions never say the word.
          ftsInsert.run(entry.id, `${entry.source} ${entry.name}`, entry.description, entry.body ?? "");
          result.added.push(entry.id);
        } else if (row.def_hash !== hash) {
          // Definition drifted: record the event and quarantine from default rosters.
          drift.run(now, entry.id, row.def_hash, hash);
          update.run({ ...params, quarantined: 1 });
          ftsDelete.run(entry.id);
          // Source name is part of the lexical surface: "memory" must find
          // memory__* tools even when descriptions never say the word.
          ftsInsert.run(entry.id, `${entry.source} ${entry.name}`, entry.description, entry.body ?? "");
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
    run();
    return result;
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
  pruneMissing(presentIds: ReadonlySet<string>, protectedSources: ReadonlySet<string> = new Set()): string[] {
    const all = this.db.prepare("SELECT id, source FROM capability").all() as Array<{
      id: string;
      source: string;
    }>;
    // protectedSources: backends that are CONFIGURED but failed to connect this
    // boot — a transient outage must never delete learned vectors or the drift
    // baseline (re-entry would bypass quarantine as a fresh "add").
    const gone = all
      .filter((r) => !presentIds.has(r.id) && !protectedSources.has(r.source))
      .map((r) => r.id);
    const run = this.db.transaction(() => {
      const delCap = this.db.prepare("DELETE FROM capability WHERE id = ?");
      const delFts = this.db.prepare("DELETE FROM capability_fts WHERE id = ?");
      const delVec = this.db.prepare("DELETE FROM vec WHERE capability = ?");
      for (const id of gone) {
        delCap.run(id);
        delFts.run(id);
        delVec.run(id);
      }
    });
    run();
    return gone;
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
   * Handoff §6.2 rule 4: the same capability re-called within the session's last
   * three calls with *different* args marks the prior attempt soft_fail — the
   * agent judged that result unusable and voted with its next action.
   */
  private markSoftFailIfRetry(currentId: number, input: RecordOutcomeInput): void {
    if (!input.argsHash) return;
    const recent = this.db
      .prepare(
        `SELECT id, capability, args_hash FROM outcome
         WHERE session = ? AND id < ? ORDER BY id DESC LIMIT ?`,
      )
      .all(input.session, currentId, SOFT_FAIL_LOOKBACK) as Array<{
      id: number;
      capability: string;
      args_hash: string | null;
    }>;
    const prior = recent.find(
      (r) => r.capability === input.capability && r.args_hash !== null && r.args_hash !== input.argsHash,
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
    const rows = this.db
      .prepare(
        `SELECT capability, class, latency_ms FROM outcome
         WHERE explored = 0 AND soft_fail = 0`,
      )
      .all() as Array<{ capability: string; class: OutcomeClass; latency_ms: number }>;

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
    const run = this.db.transaction(() => {
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
    const tokens = [...new Set(need.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])];
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
      return rows.map((r) => ({
        id: r.id,
        lexScore: span === 0 ? 1 : (worst - r.rank) / span,
      }));
    } catch {
      return []; // malformed MATCH input must never break a draft
    }
  }

  /**
   * Rung 2 fusion: 0.3·lexical + 0.7·cosine when a need vector is available.
   * Quarantined capabilities never enter a roster.
   */
  draftCandidates(need: string, k: number, needVec?: Float32Array | null): Candidate[] {
    const lexical = this.lexicalSearch(need, Math.max(30, k * 6));
    const lexById = new Map(lexical.map((l) => [l.id, l.lexScore]));

    const vecs = needVec ? this.loadVecs() : new Map<string, Float32Array>();
    const candidateIds = new Set<string>(lexById.keys());
    if (needVec) for (const id of vecs.keys()) candidateIds.add(id);

    const out: Candidate[] = [];
    for (const id of candidateIds) {
      const entry = this.activeCapability(id);
      if (!entry) continue; // quarantined or removed
      const lexScore = lexById.get(id) ?? null;
      let cosScore: number | null = null;
      if (needVec) {
        const v = vecs.get(id);
        if (v && v.length === needVec.length) cosScore = cosine(needVec, v);
      }
      const score =
        needVec && cosScore !== null
          ? HYBRID_LEX_WEIGHT * (lexScore ?? 0) + HYBRID_COS_WEIGHT * ((cosScore + 1) / 2)
          : (lexScore ?? 0);
      if (score > 0) out.push({ entry, score, lexScore, cosScore });
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
         ON CONFLICT(capability) DO UPDATE SET dims=excluded.dims, base=excluded.base, updated_at=excluded.updated_at`,
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

  /** adj if present, else base — the vector drafts actually use. */
  loadVecs(): Map<string, Float32Array> {
    const rows = this.db
      .prepare("SELECT capability, dims, base, adj FROM vec")
      .all() as Array<{ capability: string; dims: number; base: Buffer; adj: Buffer | null }>;
    const map = new Map<string, Float32Array>();
    for (const row of rows) {
      map.set(row.capability, blobToVec(row.adj ?? row.base, row.dims));
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
    const outcomesStmt = this.db.prepare(
      `SELECT need_hash, class FROM outcome
       WHERE capability = ? AND ts >= ? AND need_hash IS NOT NULL
         AND explored = 0 AND soft_fail = 0
       ORDER BY ts DESC LIMIT 500`,
    );

    let adjusted = 0;
    let skipped = 0;
    const writeAdj = this.db.prepare("UPDATE vec SET adj = ?, updated_at = ? WHERE capability = ?");

    for (const cap of caps) {
      const rows = outcomesStmt.all(cap.capability, since) as Array<{
        need_hash: string;
        class: OutcomeClass;
      }>;
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
