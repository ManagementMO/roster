import { describe, expect, it, beforeEach } from "vitest";
import { wilsonLowerBound, type CapabilityEntry } from "@rosterhq/shared";
import { openCoachDb, type CoachDb } from "./db.js";
import { CoachStore } from "./store.js";
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
    const hits = store.lexicalSearch("read a text file from the filesystem");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]!.lexScore).toBe(1);
    const last = hits[hits.length - 1]!;
    expect(last.lexScore).toBeLessThan(hits[0]!.lexScore);
    expect(last.lexScore).toBeGreaterThanOrEqual(0);
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

  it("marks prior call soft_fail on retry with modified args", () => {
    store.recordOutcome({
      session: "s1",
      source: "fs",
      capability: "fs__read_file",
      outcomeClass: "success",
      latencyMs: 40,
      argsHash: "hash-A",
    });
    store.recordOutcome({
      session: "s1",
      source: "fs",
      capability: "fs__read_file",
      outcomeClass: "success",
      latencyMs: 45,
      argsHash: "hash-B",
    });
    const rows = db.prepare("SELECT soft_fail FROM outcome ORDER BY id").all() as Array<{
      soft_fail: number;
    }>;
    expect(rows.map((r) => r.soft_fail)).toEqual([1, 0]);
  });

  it("does not mark across sessions or identical args", () => {
    store.recordOutcome({ session: "s1", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 10, argsHash: "same" });
    store.recordOutcome({ session: "s2", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 10, argsHash: "other" });
    store.recordOutcome({ session: "s1", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 10, argsHash: "same" });
    const rows = db.prepare("SELECT soft_fail FROM outcome").all() as Array<{ soft_fail: number }>;
    expect(rows.every((r) => r.soft_fail === 0)).toBe(true);
  });

  it("computes Wilson ratings excluding soft-fail and explored rows", () => {
    for (let i = 0; i < 8; i++) {
      store.recordOutcome({ session: `s${i}`, source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 100 + i });
    }
    for (let i = 0; i < 2; i++) {
      store.recordOutcome({ session: `f${i}`, source: "fs", capability: "fs__read_file", outcomeClass: "tool_fail:internal", latencyMs: 50 });
    }
    // Excluded rows: explored, and a soft-failed pair.
    store.recordOutcome({ session: "x", source: "fs", capability: "fs__read_file", outcomeClass: "tool_fail:internal", latencyMs: 5, explored: true });
    store.recordOutcome({ session: "y", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 5, argsHash: "p" });
    store.recordOutcome({ session: "y", source: "fs", capability: "fs__read_file", outcomeClass: "success", latencyMs: 5, argsHash: "q" });
    // The "y" retry marks the first as soft_fail; the second remains counted.

    store.recomputeRatings();
    const rating = store.getRating("fs__read_file");
    expect(rating).not.toBeNull();
    expect(rating!.n).toBe(11); // 8 + 2 + the counted retry success
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
  it("ensureEmbeddingModel wipes adj + need vectors on model change, keeps them otherwise", () => {
    store.upsertCapabilities([tool("a__t", "t", "d")]);
    store.storeBaseVec("a__t", new Float32Array([1, 0]));
    db.prepare("UPDATE vec SET adj = base").run();
    store.storeNeedVec("nh", new Float32Array([0, 1]));

    expect(store.ensureEmbeddingModel("model-A")).toEqual({ switched: false }); // first set
    expect(db.prepare("SELECT adj FROM vec").get()).toHaveProperty("adj"); // untouched
    expect(store.ensureEmbeddingModel("model-A").switched).toBe(false);

    const res = store.ensureEmbeddingModel("model-B");
    expect(res.switched).toBe(true);
    expect((db.prepare("SELECT adj FROM vec").get() as { adj: Buffer | null }).adj).toBeNull();
    expect(db.prepare("SELECT COUNT(*) c FROM need_vec").get()).toEqual({ c: 0 });
  });

  it("storeBaseVec clears adj when dims change (different embedding space)", () => {
    store.storeBaseVec("a__t", new Float32Array([1, 0, 0]));
    db.prepare("UPDATE vec SET adj = base").run();
    store.storeBaseVec("a__t", new Float32Array([0, 1])); // 3d → 2d
    expect((db.prepare("SELECT adj, dims FROM vec").get() as { adj: Buffer | null; dims: number })).toMatchObject({ adj: null, dims: 2 });
  });

  it("loadVecs drops length-mismatched blobs instead of reading garbage", () => {
    store.storeBaseVec("a__t", new Float32Array([1, 0, 0]));
    db.prepare("UPDATE vec SET dims = 7").run(); // corrupt: blob is 12B, dims says 28B
    expect(store.loadVecs().has("a__t")).toBe(false);
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
});
