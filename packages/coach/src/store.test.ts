import { describe, expect, it, beforeEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { wilsonLowerBound, type CapabilityEntry } from "@rosterhq/shared";
import { openCoachDb, type CoachDb } from "./db.js";
import { CoachStore, defHash } from "./store.js";
import { normalize } from "./oats.js";

const tool = (id: string, name: string, description: string): CapabilityEntry => ({
  id,
  kind: "tool",
  source: id.split("__")[0] ?? "src",
  name,
  description,
  inputSchema: { type: "object", properties: { path: { type: "string" } } },
});

let db: CoachDb;
let store: CoachStore;

beforeEach(() => {
  db = openCoachDb(":memory:");
  store = new CoachStore(db);
});

describe("capability upsert + drift", () => {
  it("adds, is idempotent, and detects drift with quarantine", () => {
    const entry = tool("fs__read_file", "read_file", "Read a file from disk");
    expect(store.upsertCapabilities([entry]).added).toEqual(["fs__read_file"]);
    expect(store.upsertCapabilities([entry])).toMatchObject({ added: [], changed: [], driftEvents: 0 });

    const drifted = { ...entry, description: "Read a file from disk (now different)" };
    const res = store.upsertCapabilities([drifted]);
    expect(res.changed).toEqual(["fs__read_file"]);
    expect(res.driftEvents).toBe(1);
    expect(store.driftEvents()).toHaveLength(1);

    // Quarantined: hidden from default listing and drafts until cleared.
    expect(store.listCapabilities()).toHaveLength(0);
    expect(store.listCapabilities({ includeQuarantined: true })).toHaveLength(1);
    store.clearQuarantine("fs__read_file");
    expect(store.listCapabilities()).toHaveLength(1);
  });
});

/**
 * Drift identity must cover the fields a CLIENT or agent ACTS on, not only the
 * ones the retrieval index reads. On the reviewed base `defHash` hashed only
 * name/description/inputSchema/outputSchema/body, so a backend could flip
 * `annotations.destructiveHint` true->false — the exact hint clients gate
 * confirmations on — with a byte-identical hash: no drift event, no quarantine
 * (reproduced). Safety annotations and the execution contract must participate
 * in stable definition identity; volatile runtime state must not.
 */
describe("drift identity covers safety and contract metadata", () => {
  const base: CapabilityEntry = {
    id: "fs__delete",
    kind: "tool",
    source: "fs",
    name: "delete",
    description: "Delete a file",
    title: "Delete a file",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    execution: { taskSupport: "optional" },
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
  };
  const seed = (now = 1) => expect(store.upsertCapabilities([base], now).added).toEqual(["fs__delete"]);
  const expectDrift = (next: CapabilityEntry, why: string) => {
    const res = store.upsertCapabilities([next], 2);
    expect(res.changed, why).toEqual(["fs__delete"]);
    expect(res.driftEvents, why).toBe(1);
    expect(store.driftEvents().length, why).toBeGreaterThanOrEqual(1);
    expect(store.listCapabilities(), why).toHaveLength(0); // quarantined => withheld
  };
  const expectStable = (next: CapabilityEntry, why: string) => {
    const res = store.upsertCapabilities([next], 2);
    expect(res, why).toMatchObject({ changed: [], driftEvents: 0 });
    expect(store.listCapabilities(), why).toHaveLength(1); // never quarantined
  };

  it("drifts on each safety annotation independently", () => {
    for (const [k, v] of [
      ["destructiveHint", false],
      ["readOnlyHint", true],
      ["idempotentHint", true],
      ["openWorldHint", true],
    ] as const) {
      db = openCoachDb(":memory:");
      store = new CoachStore(db);
      seed();
      expectDrift({ ...base, annotations: { ...base.annotations, [k]: v } }, `annotations.${k}`);
    }
  });

  it("drifts on an execution/task-support contract change", () => {
    seed();
    expectDrift({ ...base, execution: { taskSupport: "required" } }, "taskSupport optional->required");
  });

  it("drifts on a title change (definition text the agent is shown)", () => {
    seed();
    expectDrift({ ...base, title: "Delete EVERYTHING" }, "title rewritten");
  });

  it("drifts on an outputSchema change (positive control)", () => {
    seed();
    expectDrift(
      { ...base, outputSchema: { type: "object", properties: { ok: { type: "boolean" } } } },
      "outputSchema added",
    );
  });

  it("does NOT drift on pure JSON key-order changes (negative control)", () => {
    seed();
    expectStable(
      {
        ...base,
        annotations: { openWorldHint: false, idempotentHint: false, destructiveHint: true, readOnlyHint: false },
        inputSchema: { properties: { path: { type: "string" } }, type: "object" },
      },
      "reordered keys",
    );
  });

  it("treats an absent field and an explicit undefined as equivalent (no false drift)", () => {
    const bare: CapabilityEntry = {
      id: "fs__plain",
      kind: "tool",
      source: "fs",
      name: "plain",
      description: "no metadata",
      inputSchema: { type: "object" },
    };
    store.upsertCapabilities([bare], 1); // fields absent
    // Same definition, but with the optional fields present as explicit undefined.
    const res = store.upsertCapabilities(
      [{ ...bare, title: undefined, annotations: undefined, execution: undefined }],
      2,
    );
    expect(res).toMatchObject({ changed: [], driftEvents: 0 });
  });

  it("persists safety metadata so a DB reload round-trips it and does not self-drift", () => {
    seed();
    // New store over the SAME db handle = a fresh process reading the same file.
    const reopened = new CoachStore(db);
    const got = reopened.getCapability("fs__delete");
    expect(got?.annotations).toEqual(base.annotations);
    expect(got?.execution).toEqual(base.execution);
    expect(got?.title).toBe(base.title);
    // Re-sighting the identical definition after reload must be a no-op.
    expect(reopened.upsertCapabilities([base], 3)).toMatchObject({ changed: [], driftEvents: 0 });
  });

  it("carries the expanded identity through a remove/re-add tombstone", () => {
    seed();
    store.pruneMissing(new Set(), new Set(), { now: 2 });
    const res = store.upsertCapabilities(
      [{ ...base, annotations: { ...base.annotations, destructiveHint: false } }],
      3,
    );
    expect(res.driftEvents).toBe(1); // metadata-only change cannot slip back in as "new"
    expect(res.changed).toEqual(["fs__delete"]);
    expect(store.listCapabilities()).toHaveLength(0);
  });

  it("deletes the stored vector on metadata-only drift and rejects a stale-hash backfill", () => {
    seed();
    store.storeBaseVec("fs__delete", new Float32Array([1, 0]), 1);
    const staleHash = defHash(base);
    expectDrift({ ...base, annotations: { ...base.annotations, destructiveHint: false } }, "vector-deletion drift");
    // A warm-boot backfill still holding the PRE-drift hash must not land.
    expect(
      store.storeBaseVec("fs__delete", new Float32Array([0, 1]), 3, { defHash: staleHash, modelId: "m" }),
    ).toBe(false);
  });

  it("re-baselines silently when the hash FORMULA changes (no whole-roster quarantine)", () => {
    seed();
    store.upsertCapabilities([tool("fs__read", "read", "Read a file")], 1);
    expect(store.listCapabilities()).toHaveLength(2);
    db.prepare("UPDATE meta SET value = 'v-ancient' WHERE key = 'def_hash_version'").run();
    const store2 = new CoachStore(db);
    const res = store2.upsertCapabilities([base, tool("fs__read", "read", "Read a file")], 5);
    expect(res.driftEvents, "a formula change is our change, not backend drift").toBe(0);
    expect(res.changed).toEqual([]);
    expect(store2.listCapabilities()).toHaveLength(2);
  });
});

describe("lexical search", () => {
  beforeEach(() => {
    store.upsertCapabilities([
      tool("fs__read_file", "read_file", "Read the contents of a text file from the filesystem"),
      tool("mail__send", "send_email", "Compose and deliver an email message"),
      tool("web__search", "web_search", "Search the web for pages matching a query"),
    ]);
  });

  it("finds by description terms and ranks sensibly", () => {
    const hits = store.lexicalSearch("read a file from disk");
    expect(hits[0]?.id).toBe("fs__read_file");
  });

  it("finds a tool by its SERVER name even when descriptions never say it", () => {
    store.upsertCapabilities([
      { id: "memory__create_entities", kind: "tool", source: "memory", name: "create_entities", description: "Add nodes to the graph", inputSchema: { type: "object" } },
    ]);
    const hits = store.lexicalSearch("memory");
    expect(hits.map((h) => h.id)).toContain("memory__create_entities");
  });

  it("returns empty on nonsense input instead of throwing", () => {
    expect(store.lexicalSearch("!!! ??? ~~")).toEqual([]);
    expect(store.lexicalSearch("")).toEqual([]);
  });

  it("normalizes bm25 so the worst match never scores 1.0 (regression: || 1 bug)", () => {
    // Two genuine CONTENT-word matches (web←search, mail←email) — not the
    // stopword pollution the old query accidentally relied on.
    const hits = store.lexicalSearch("search email message");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]!.lexScore).toBe(1);
    const last = hits[hits.length - 1]!;
    expect(last.lexScore).toBeLessThan(hits[0]!.lexScore);
    expect(last.lexScore).toBeGreaterThanOrEqual(0);
  });

  it("stopword-only overlap no longer drags a wrong-source tool into results", () => {
    // A stopword-dense tool that shares ONLY function words with the need.
    store.upsertCapabilities([
      tool("junk__noise", "noise", "the one for you to be with as it does that"),
    ]);
    // Need has real content (read, file) plus stopwords (the, for, me).
    const ids = store.lexicalSearch("read the file for me").map((h) => h.id);
    expect(ids).toContain("fs__read_file");
    expect(ids).not.toContain("junk__noise"); // matched only via stopwords → filtered out
  });

  it("reaches a camelCase-named tool by its split words", () => {
    store.upsertCapabilities([
      tool("everything__printEnv", "printEnv", "Prints all environment variables"),
    ]);
    expect(store.lexicalSearch("print env").map((h) => h.id)).toContain("everything__printEnv");
  });

  it("auto-clears quarantine on stable re-sight — but only after the 24h dwell", () => {
    const t0 = Date.now();
    const drifted = tool("fs__read_file", "read_file", "a NEW description");
    store.upsertCapabilities([drifted], t0); // drift vs beforeEach seed → quarantined
    expect(store.listCapabilities().find((c) => c.id === "fs__read_file")).toBeUndefined();

    store.upsertCapabilities([drifted], t0 + 60_000); // minutes later: still quarantined
    expect(store.listCapabilities().find((c) => c.id === "fs__read_file")).toBeUndefined();

    store.upsertCapabilities([drifted], t0 + 25 * 3600 * 1000); // past dwell: clears
    expect(store.listCapabilities().find((c) => c.id === "fs__read_file")).toBeDefined();
    expect(store.driftEvents()).toHaveLength(1); // alarm fired exactly once
  });

  it("indexes the source name lexically ('memory' finds memory__* tools)", () => {
    store.upsertCapabilities([
      tool("memory__create_entities", "create_entities", "Create multiple new entities in the knowledge graph"),
    ]);
    expect(store.lexicalSearch("memory")[0]?.id).toBe("memory__create_entities");
  });

  it("pruneMissing removes ghosts but keeps present ids", () => {
    expect(store.listCapabilities()).toHaveLength(3);
    const gone = store.pruneMissing(new Set(["fs__read_file"]));
    expect(gone.sort()).toEqual(["mail__send", "web__search"]);
    expect(store.listCapabilities().map((c) => c.id)).toEqual(["fs__read_file"]);
    expect(store.lexicalSearch("email message")).toEqual([]);
  });

  it("pruneMissing protects capabilities of unreachable-but-configured sources", () => {
    // 'mail' is down this boot (not in presentIds) but still configured →
    // its tools must survive the outage, not be pruned and re-added fresh.
    const gone = store.pruneMissing(new Set(["fs__read_file"]), new Set(["mail"]));
    expect(gone).toEqual(["web__search"]);
    expect(store.listCapabilities().map((c) => c.id).sort()).toEqual(["fs__read_file", "mail__send"]);
  });

  it("never returns an empty draft when capabilities exist (paraphrase fallback)", () => {
    // "remember a fact" shares no tokens with any seeded tool — lexical is 0,
    // but the draft must still surface tools to work with.
    const candidates = store.draftCandidates("remember a fact xyzzy", 5);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(3);
  });

  it("draftCandidates excludes quarantined entries", () => {
    store.upsertCapabilities([
      { ...tool("fs__read_file", "read_file", "changed description triggers drift"), kind: "tool" },
    ]);
    const candidates = store.draftCandidates("read file", 5);
    expect(candidates.find((c) => c.entry.id === "fs__read_file")).toBeUndefined();
  });
});

describe("hybrid fusion", () => {
  it("dense similarity outvotes lexical overlap at 30/70", () => {
    store.upsertCapabilities([
      tool("a__deliver", "deliver_message", "Deliver a message to a recipient mailbox"),
      tool("b__file_notes", "file_notes", "Send text about files and messages and email words"),
    ]);
    // Handcrafted vectors: "a" is semantically aligned with the need, "b" is not.
    const needVec = normalize(new Float32Array([1, 0, 0]));
    store.storeBaseVec("a__deliver", new Float32Array([0.95, 0.05, 0]));
    store.storeBaseVec("b__file_notes", new Float32Array([0, 1, 0]));

    const ranked = store.draftCandidates("send an email message", 2, needVec);
    expect(ranked[0]?.entry.id).toBe("a__deliver");
    expect(ranked[0]?.cosScore).toBeGreaterThan(0.9);
  });
});

describe("outcomes, soft-fail, ratings", () => {
  beforeEach(() => {
    store.upsertCapabilities([tool("fs__read_file", "read_file", "Read a file")]);
  });

  it("does NOT soft-fail a successful prior call — iterating a tool over inputs is not a retry (M1)", () => {
    // 5 successful reads of 5 different files: the dominant agent pattern. None
    // may be discarded, or OATS + ratings starve on the most-used tools.
    for (let i = 0; i < 5; i++) {
      store.recordOutcome({ session: "s1", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 40, argsHash: `file-${i}` });
    }
    const rows = db.prepare("SELECT soft_fail FROM outcome ORDER BY id").all() as Array<{ soft_fail: number }>;
    expect(rows.map((r) => r.soft_fail)).toEqual([0, 0, 0, 0, 0]);
  });

  it("DOES soft-fail a prior FAILURE followed by an adjusted-args retry (fairness intent preserved)", () => {
    store.recordOutcome({ session: "s1", source: "fs", capability: "fs__read_file", outcomeClass: "tool_fail:internal", latencyMs: 40, argsHash: "bad-args" });
    store.recordOutcome({ session: "s1", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 45, argsHash: "fixed-args" });
    const rows = db.prepare("SELECT soft_fail FROM outcome ORDER BY id").all() as Array<{ soft_fail: number }>;
    expect(rows.map((r) => r.soft_fail)).toEqual([1, 0]); // the failed first attempt is excluded, not counted against the tool
  });

  it("does not mark across sessions or identical args", () => {
    store.recordOutcome({ session: "s1", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 10, argsHash: "same" });
    store.recordOutcome({ session: "s2", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 10, argsHash: "other" });
    store.recordOutcome({ session: "s1", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 10, argsHash: "same" });
    const rows = db.prepare("SELECT soft_fail FROM outcome").all() as Array<{ soft_fail: number }>;
    expect(rows.every((r) => r.soft_fail === 0)).toBe(true);
  });

  it("recordOutcome rolls back its insert and soft-fail update when suggestion marking fails", () => {
    store.recordOutcome({
      session: "rollback-session",
      source: "fs",
      capability: "fs__read_file",
      outcomeClass: "tool_fail:internal",
      latencyMs: 10,
      argsHash: "first-args-hash",
    });
    store.recordSuggestion("rollback-session", "failed__tool", "fs__read_file");
    db.exec(`
      CREATE TRIGGER fail_suggestion_update
      BEFORE UPDATE OF taken ON suggestion
      BEGIN
        SELECT RAISE(ABORT, 'forced suggestion update failure');
      END
    `);

    expect(() =>
      store.recordOutcome({
        session: "rollback-session",
        source: "fs",
        capability: "fs__read_file",
        outcomeClass: "success",
        latencyMs: 11,
        argsHash: "retry-args-hash",
      }),
    ).toThrow("forced suggestion update failure");

    expect(db.prepare("SELECT id, soft_fail FROM outcome ORDER BY id").all()).toEqual([
      { id: 1, soft_fail: 0 },
    ]);
    expect(db.prepare("SELECT taken FROM suggestion").get()).toEqual({ taken: 0 });
  });

  it("computes Wilson ratings excluding soft-fail and explored rows", () => {
    for (let i = 0; i < 8; i++) {
      store.recordOutcome({ session: `s${i}`, source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 100 + i });
    }
    for (let i = 0; i < 2; i++) {
      store.recordOutcome({ session: `f${i}`, source: "fs", capability: "fs__read_file", outcomeClass: "tool_fail:internal", latencyMs: 50 });
    }
    // Excluded row: explored. A soft-failed row: a FAILURE then an adjusted retry.
    store.recordOutcome({ session: "x", source: "fs", capability: "fs__read_file", outcomeClass: "tool_fail:internal", latencyMs: 5, explored: true });
    store.recordOutcome({ session: "y", source: "fs", capability: "fs__read_file", outcomeClass: "tool_fail:timeout", latencyMs: 5, argsHash: "p" });
    store.recordOutcome({ session: "y", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 5, argsHash: "q" });
    // The "y" failure (p) is soft-failed by the adjusted retry (q); the success (q) counts.

    store.recomputeRatings();
    const rating = store.getRating("fs__read_file");
    expect(rating).not.toBeNull();
    expect(rating!.n).toBe(11); // 8 success + 2 fail + the counted retry success (the soft-failed timeout + explored are out)
    expect(rating!.successes).toBe(9);
    expect(rating!.wilsonLb).toBeCloseTo(wilsonLowerBound(9, 11), 6);
    expect(rating!.p50Ms).toBeGreaterThan(0);
  });
});

describe("runMaintenanceIfDue (the nightly job)", () => {
  it("runs once, is debounced, and actually populates ratings", () => {
    store.upsertCapabilities([tool("fs__read_file", "read_file", "Read a file")]);
    for (let i = 0; i < 6; i++) {
      store.recordOutcome({ session: `s${i}`, source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 20 });
    }
    const t0 = 1_000_000_000_000;
    const first = store.runMaintenanceIfDue(20 * 3600 * 1000, t0);
    expect(first.ran).toBe(true);
    expect(store.getRating("fs__read_file")?.n).toBe(6);

    // Debounced: a second call an hour later does nothing.
    expect(store.runMaintenanceIfDue(20 * 3600 * 1000, t0 + 3600 * 1000).ran).toBe(false);
    // Due again after the interval.
    expect(store.runMaintenanceIfDue(20 * 3600 * 1000, t0 + 21 * 3600 * 1000).ran).toBe(true);
  });
});

describe("Sixth Man suggestion logging", () => {
  it("records suggestions and flips taken when the agent follows one", () => {
    store.recordSuggestion("s1", "alpha__flaky", "beta__echo");
    let row = db.prepare("SELECT taken FROM suggestion").get() as { taken: number };
    expect(row.taken).toBe(0);
    store.recordOutcome({
      session: "s1",
      source: "beta",
      capability: "beta__echo",
      outcomeClass: "success",
      latencyMs: 12,
    });
    row = db.prepare("SELECT taken FROM suggestion").get() as { taken: number };
    expect(row.taken).toBe(1);
  });
});

describe("model-switch guards", () => {
  it("ensureEmbeddingModel DELETES all vectors on model change so the backfill re-embeds (DEF-1)", () => {
    store.upsertCapabilities([tool("a__t", "t", "d")]);
    store.storeBaseVec("a__t", new Float32Array([1, 0]));
    db.prepare("UPDATE vec SET adj = base").run();
    store.storeNeedVec("nh", new Float32Array([0, 1]));

    expect(store.ensureEmbeddingModel("model-A")).toEqual({ switched: false }); // first set
    expect(store.vecCapabilityIds().has("a__t")).toBe(true); // untouched on same model
    expect(store.ensureEmbeddingModel("model-A").switched).toBe(false);

    const res = store.ensureEmbeddingModel("model-B");
    expect(res.switched).toBe(true);
    // Rows GONE, not adj-nulled: the D4 warm-boot skip re-embeds only ids with
    // no row — nulling adj alone pinned the old-space base forever.
    expect(store.vecCapabilityIds().size).toBe(0);
    expect(db.prepare("SELECT COUNT(*) c FROM vec").get()).toEqual({ c: 0 });
    expect(db.prepare("SELECT COUNT(*) c FROM need_vec").get()).toEqual({ c: 0 });
  });

  it("storeBaseVec clears adj when dims change (different embedding space)", () => {
    store.storeBaseVec("a__t", new Float32Array([1, 0, 0]));
    db.prepare("UPDATE vec SET adj = base").run();
    store.storeBaseVec("a__t", new Float32Array([0, 1])); // 3d → 2d
    expect((db.prepare("SELECT adj, dims FROM vec").get() as { adj: Buffer | null; dims: number })).toMatchObject({ adj: null, dims: 2 });
  });

  it.each([
    {
      corruption: "zero dimensions",
      corrupt: () => db.prepare("UPDATE vec SET dims = 0 WHERE capability = ?").run("a__t"),
    },
    {
      corruption: "fractional dimensions",
      corrupt: () => db.prepare("UPDATE vec SET dims = 1.5 WHERE capability = ?").run("a__t"),
    },
    {
      corruption: "a length-mismatched blob",
      corrupt: () => db.prepare("UPDATE vec SET dims = 7 WHERE capability = ?").run("a__t"),
    },
    {
      corruption: "a non-finite base vector",
      corrupt: () => db
        .prepare("UPDATE vec SET base = ? WHERE capability = ?")
        .run(Buffer.from(new Float32Array([Number.NaN, 0, 0]).buffer), "a__t"),
    },
  ])("repairs a vector row with $corruption", ({ corrupt }) => {
    store.storeBaseVec("a__t", new Float32Array([1, 0, 0]));
    corrupt();

    expect(store.loadVecs().has("a__t")).toBe(false);
    expect(store.vecCapabilityIds().has("a__t")).toBe(false);
    expect(db.prepare("SELECT 1 FROM vec WHERE capability = ?").get("a__t")).toBeUndefined();
  });

  it.each([
    ["a length-mismatched adjustment", Buffer.alloc(5)],
    [
      "a non-finite adjustment",
      Buffer.from(new Float32Array([1, Number.POSITIVE_INFINITY, 0]).buffer),
    ],
  ])("clears %s while retaining the valid base vector", (_corruption, adj) => {
    store.storeBaseVec("a__t", new Float32Array([1, 0, 0]));
    db.prepare("UPDATE vec SET adj = ? WHERE capability = ?").run(adj, "a__t");

    expect(Array.from(store.loadVecs().get("a__t") ?? [])).toEqual([1, 0, 0]);
    expect(store.vecCapabilityIds().has("a__t")).toBe(true);
    expect(db.prepare("SELECT adj FROM vec WHERE capability = ?").get("a__t")).toEqual({
      adj: null,
    });
  });

  it("rejects a stale backfill after capability drift", () => {
    const original = tool("a__t", "t", "original definition");
    store.upsertCapabilities([original]);
    store.ensureEmbeddingModel("model-A");
    const expected = { defHash: defHash(original), modelId: "model-A" };

    store.upsertCapabilities([{ ...original, description: "drifted definition" }]);

    expect(store.storeBaseVec("a__t", new Float32Array([1, 0]), 123, expected)).toBe(false);
    expect(db.prepare("SELECT 1 FROM vec WHERE capability = ?").get("a__t")).toBeUndefined();
  });

  it("rejects a stale backfill after an embedding-model switch", () => {
    const entry = tool("a__t", "t", "stable definition");
    store.upsertCapabilities([entry]);
    store.ensureEmbeddingModel("model-A");
    const expected = { defHash: defHash(entry), modelId: "model-A" };
    expect(store.storeBaseVec("a__t", new Float32Array([1, 0]), 122, expected)).toBe(true);

    store.ensureEmbeddingModel("model-B");

    expect(store.storeBaseVec("a__t", new Float32Array([1, 0]), 123, expected)).toBe(false);
    expect(db.prepare("SELECT 1 FROM vec WHERE capability = ?").get("a__t")).toBeUndefined();
  });
});

describe("hybrid fusion normalization", () => {
  it("min-max normalizes the cosine channel so a vec-less tool can still win on lexical", () => {
    store.upsertCapabilities([
      tool("a__exact", "exact_match_tool", "read a text file from the filesystem now"),
      tool("b__vec1", "unrelated_one", "totally different topic entirely"),
      tool("c__vec2", "unrelated_two", "another unrelated capability here"),
    ]);
    // b and c have vectors (both mediocre for the need); a has NO vector but a perfect lexical hit.
    const needVec = new Float32Array([1, 0, 0]);
    store.storeBaseVec("b__vec1", new Float32Array([0.3, 0.6, 0.74]));
    store.storeBaseVec("c__vec2", new Float32Array([0.28, 0.62, 0.73]));
    const ranked = store.draftCandidates("read a text file from the filesystem now", 3, needVec);
    expect(ranked[0]?.entry.id).toBe("a__exact");
  });
});

describe("pruneMissing grace window", () => {
  it("keeps rows another process touched during our boot window", () => {
    const t0 = 1_000_000;
    store.upsertCapabilities([tool("x__old", "old", "seen long ago")], t0);
    store.upsertCapabilities([tool("y__fresh", "fresh", "sibling just upserted this")], t0 + 5_000);
    const gone = store.pruneMissing(new Set(), new Set(), { keepSeenSince: t0 + 1_000 });
    expect(gone).toEqual(["x__old"]);
    expect(store.listCapabilities().map((c) => c.id)).toEqual(["y__fresh"]);
  });

  it("pruneMissing selects and deletes under one immediate transaction", () => {
    const directory = mkdtempSync(join(tmpdir(), "roster-coach-prune-"));
    const path = join(directory, "coach.db");
    const pruneDb = openCoachDb(path);
    const refreshDb = openCoachDb(path);
    try {
      const pruneStore = new CoachStore(pruneDb);
      const t0 = 1_000_000;
      const refreshedAt = t0 + 2_000;
      pruneStore.upsertCapabilities([tool("race__tool", "tool", "race target")], t0);
      refreshDb.pragma("busy_timeout = 0");

      const sqliteErrorCode = (error: unknown): string | undefined => {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          typeof error.code !== "string"
        ) {
          return undefined;
        }
        return error.code;
      };
      let refreshErrorCode: string | undefined;
      const originalPrepare = pruneDb.prepare.bind(pruneDb);
      pruneDb.prepare = ((source: string) => {
        const statement = originalPrepare(source);
        if (source === "SELECT id, source, last_seen, def_hash, quarantined FROM capability") {
          const originalAll = statement.all.bind(statement);
          statement.all = (() => {
            const rows = originalAll();
            try {
              refreshDb
                .prepare("UPDATE capability SET last_seen = ? WHERE id = ?")
                .run(refreshedAt, "race__tool");
            } catch (error) {
              refreshErrorCode = sqliteErrorCode(error);
            }
            return rows;
          }) as typeof statement.all;
        }
        return statement;
      }) as CoachDb["prepare"];

      let pruneErrorCode: string | undefined;
      try {
        pruneStore.pruneMissing(new Set(), new Set(), { keepSeenSince: t0 + 1_000 });
      } catch (error) {
        pruneErrorCode = sqliteErrorCode(error);
      }

      // IMMEDIATE must reserve the writer lock before the SELECT. A merely
      // deferred transaction still reports `inTransaction`, but lets this
      // sibling UPDATE commit after the stale snapshot.
      expect(refreshErrorCode).toBe("SQLITE_BUSY");
      expect(pruneErrorCode).toBeUndefined();
      expect(refreshDb.prepare("SELECT 1 FROM capability WHERE id = ?").get("race__tool"))
        .toBeUndefined();
    } finally {
      pruneDb.close();
      refreshDb.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("OATS nightly", () => {
  it("adjusts only capabilities with ≥4 success needs and stores adj", () => {
    store.upsertCapabilities([tool("fs__read_file", "read_file", "Read a file")]);
    store.storeBaseVec("fs__read_file", new Float32Array([1, 0, 0]));

    for (let i = 0; i < 4; i++) {
      const needHash = `need-${i}`;
      store.storeNeedVec(needHash, new Float32Array([0, 1, 0]));
      store.recordOutcome({
        session: `s${i}`,
        source: "fs",
        capability: "fs__read_file",
        outcomeClass: "success",
        latencyMs: 10,
        needHash,
      });
    }
    const summary = store.runOats();
    expect(summary.adjusted).toBe(1);

    const vecs = store.loadVecs();
    const adj = vecs.get("fs__read_file")!;
    // Moved toward the success centroid (y-axis).
    expect(adj[1]).toBeGreaterThan(0.3);
  });

  it("skips below the floor", () => {
    store.upsertCapabilities([tool("a__t", "t", "d")]);
    store.storeBaseVec("a__t", new Float32Array([1, 0, 0]));
    expect(store.runOats()).toEqual({ adjusted: 0, skipped: 1 });
  });

  it("discards a non-finite need vector without aborting OATS", () => {
    store.upsertCapabilities([tool("a__t", "t", "d")]);
    store.storeBaseVec("a__t", new Float32Array([1, 0, 0]));
    for (let i = 0; i < 4; i++) {
      const needHash = `need-${i}`;
      store.storeNeedVec(needHash, new Float32Array([0, 1, 0]));
      store.recordOutcome({
        session: `s${i}`,
        source: "a",
        capability: "a__t",
        outcomeClass: "success",
        latencyMs: 10,
        needHash,
      });
    }
    db.prepare("UPDATE need_vec SET vec = ? WHERE need_hash = ?").run(
      Buffer.from(new Float32Array([0, Number.NaN, 0]).buffer),
      "need-0",
    );

    expect(store.runOats()).toEqual({ adjusted: 0, skipped: 1 });
    expect(db.prepare("SELECT 1 FROM need_vec WHERE need_hash = ?").get("need-0"))
      .toBeUndefined();
  });
});

describe("fix-wave regressions (lab swarm)", () => {
  it("keeps the worst genuine lexical hit in a draft — floor beats rated-fallback displacement", () => {
    // Two real matches for "write": min-max scores the worst 0, score>0 drops
    // it. Two UNRELATED tools carry real ratings, so the fallback prefers THEM
    // over the (unrated) dropped hit — without the floor the worst write tool
    // is absent. k=3 leaves no room for fallback to accidentally re-add it.
    store.upsertCapabilities([
      tool("fs__write_file", "write_file", "write text content to a file on disk"),
      tool("sqlite__write_query", "write_query", "write rows via an insert query"),
      tool("rated__alpha", "alpha", "completely unrelated capability alpha"),
      tool("rated__beta", "beta", "completely unrelated capability beta"),
    ]);
    for (const cap of ["rated__alpha", "rated__beta"]) {
      for (let i = 0; i < 5; i++) {
        store.recordOutcome({ session: `${cap}${i}`, source: cap.split("__")[0]!, capability: cap, outcomeClass: "success", latencyMs: 10 });
      }
    }
    store.recomputeRatings();
    const ids = store.draftCandidates("write", 3).map((c) => c.entry.id);
    // Both genuine lexical hits present; whichever min-max zeroes is kept only by the floor.
    expect(ids).toContain("fs__write_file");
    expect(ids).toContain("sqlite__write_query");
  });

  it("recomputeRatings(category) aggregates ONLY that intent category, never global stats", () => {
    store.upsertCapabilities([tool("fs__read_file", "read_file", "Read a file")]);
    // 3 web-category successes, 1 db-category failure — different categories.
    for (let i = 0; i < 3; i++) {
      store.recordOutcome({ session: `w${i}`, source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 10, intentCategory: "web" });
    }
    store.recordOutcome({ session: "d0", source: "fs", capability: "fs__read_file", outcomeClass: "tool_fail:internal", latencyMs: 10, intentCategory: "db" });
    store.recomputeRatings("web");
    const web = store.getRating("fs__read_file", "web");
    expect(web).toMatchObject({ n: 3, successes: 3 }); // NOT n:4 (the db failure must not leak in)
  });

  it("recomputeRatings drops a rating whose evidence has vanished", () => {
    store.upsertCapabilities([tool("fs__read_file", "read_file", "Read a file")]);
    store.recordOutcome({ session: "s", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 10 });
    store.recomputeRatings();
    expect(store.getRating("fs__read_file")).not.toBeNull();
    // Evidence gone → the stale rating must not survive to keep ranking it.
    db.prepare("DELETE FROM outcome").run();
    store.recomputeRatings();
    expect(store.getRating("fs__read_file")).toBeNull();
  });

  it("pruneMissing protects a source under its de-suffixed base (collision-suffixed key)", () => {
    // Capability stored under the collision-suffixed key "mail-2"; the config
    // name protects only the base "mail". It must survive an outage.
    store.upsertCapabilities([tool("mail-2__send", "send", "Send an email message")]);
    const gone = store.pruneMissing(new Set(), new Set(["mail"]));
    expect(gone).toEqual([]);
    expect(store.getCapability("mail-2__send")).not.toBeNull();
  });
});

describe("fix-wave round 2 — drift + robustness", () => {
  it("remove + re-add with a CHANGED definition raises drift (no evasion via prune)", () => {
    const t0 = 1_000_000;
    store.upsertCapabilities([tool("s__t", "t", "original description")], t0);
    store.pruneMissing(new Set(), new Set(), { now: t0 + 1000 }); // server dropped the tool
    expect(store.getCapability("s__t")).toBeNull();
    // Comes back later, definition CHANGED → must be drift + quarantined, not "new".
    const res = store.upsertCapabilities([tool("s__t", "t", "COMPLETELY different now")], t0 + 2000);
    expect(res.driftEvents).toBe(1);
    expect(store.driftEvents()).toHaveLength(1);
    expect(store.listCapabilities().find((c) => c.id === "s__t")).toBeUndefined(); // quarantined
  });

  it("remove + re-add UNCHANGED is a clean re-add (no false drift)", () => {
    const t0 = 1_000_000;
    const cap = tool("s__t", "t", "stable description");
    store.upsertCapabilities([cap], t0);
    store.pruneMissing(new Set(), new Set(), { now: t0 + 1000 });
    const res = store.upsertCapabilities([cap], t0 + 2000);
    expect(res.driftEvents).toBe(0);
    expect(res.added).toEqual(["s__t"]);
    expect(store.listCapabilities().find((c) => c.id === "s__t")).toBeDefined(); // active
  });

  it("drift invalidates the stored vector — warm-boot skip must re-embed changed tools (round 4b)", () => {
    const v1 = tool("s__t", "t", "OLD semantics entirely");
    store.upsertCapabilities([v1]);
    store.storeBaseVec("s__t", new Float32Array([1, 0, 0]));
    expect(store.vecCapabilityIds().has("s__t")).toBe(true);
    store.upsertCapabilities([{ ...v1, description: "COMPLETELY NEW semantics" }]); // drift
    // Without this, serve's already-embedded skip (D4) pins the stale embedding forever.
    expect(store.vecCapabilityIds().has("s__t")).toBe(false);
  });

  it("treats an outputSchema change as drift (was invisible to both detectors)", () => {
    const base: CapabilityEntry = {
      id: "a__t", kind: "tool", source: "a", name: "t", description: "d",
      inputSchema: { type: "object" },
      outputSchema: { type: "object", properties: { a: { type: "string" } } },
    };
    store.upsertCapabilities([base]);
    const changed: CapabilityEntry = { ...base, outputSchema: { type: "object", properties: { b: { type: "number" } } } };
    const res = store.upsertCapabilities([changed]);
    expect(res.driftEvents).toBe(1);
    expect(res.changed).toEqual(["a__t"]);
  });
});

describe("recomputeRatings is safe under cross-process contention (L11)", () => {
  it("many processes log outcomes and recompute at once without crashing or corrupting", async () => {
    // Several `roster serve` processes share one coach.db. This spawns real
    // separate node processes that concurrently recordOutcome (IMMEDIATE write
    // txn) AND recomputeRatings (write-only txn) against ONE file-backed WAL DB.
    // A clean exit(0) from every worker proves no writer crashed with
    // SQLITE_BUSY or corrupted the file; the final aggregate proves durability.
    const dir = mkdtempSync(join(tmpdir(), "coach-contention-"));
    const dbPath = join(dir, "coach.db");
    try {
      new CoachStore(openCoachDb(dbPath)).close(); // migrate once, then release

      const worker = fileURLToPath(new URL("../test/fixtures/recompute-worker.mjs", import.meta.url));
      const CAP = "cap__contended";
      const N = 4;
      const COUNT = 25;
      const ITERS = 6;

      const codes = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          new Promise<number | null>((resolve) => {
            const child = spawn(
              process.execPath,
              [worker, dbPath, CAP, `w${i}`, String(COUNT), String(ITERS)],
              { stdio: ["ignore", "ignore", "pipe"] },
            );
            let err = "";
            child.stderr?.on("data", (d: Buffer) => {
              err += d.toString();
            });
            child.on("exit", (code) => {
              if (code !== 0) console.error(`contention worker ${i} failed:\n${err}`);
              resolve(code);
            });
          }),
        ),
      );
      expect(codes.every((c) => c === 0)).toBe(true);

      // The file survived and a final recompute reflects EVERY logged outcome.
      const store = new CoachStore(openCoachDb(dbPath));
      store.recomputeRatings();
      const rating = store.getRating(CAP);
      expect(rating?.n).toBe(N * COUNT);
      expect(rating?.successes).toBe(N * COUNT);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
