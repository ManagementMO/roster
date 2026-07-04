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

  it("auto-clears quarantine when the drifted definition re-appears unchanged", () => {
    const drifted = tool("fs__read_file", "read_file", "a NEW description");
    store.upsertCapabilities([drifted]); // drift vs beforeEach seed → quarantined
    expect(store.listCapabilities().find((c) => c.id === "fs__read_file")).toBeUndefined();
    store.upsertCapabilities([drifted]); // stable re-sight of the same new hash
    expect(store.listCapabilities().find((c) => c.id === "fs__read_file")).toBeDefined();
    expect(store.driftEvents()).toHaveLength(1); // alarm fired exactly once
  });

  it("pruneMissing removes ghosts but keeps present ids", () => {
    expect(store.listCapabilities()).toHaveLength(3);
    const gone = store.pruneMissing(new Set(["fs__read_file"]));
    expect(gone.sort()).toEqual(["mail__send", "web__search"]);
    expect(store.listCapabilities().map((c) => c.id)).toEqual(["fs__read_file"]);
    expect(store.lexicalSearch("email message")).toEqual([]);
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
