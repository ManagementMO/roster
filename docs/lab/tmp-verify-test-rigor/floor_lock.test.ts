import { describe, expect, it } from "vitest";
import type { CapabilityEntry } from "@rosterhq/shared";
import { openCoachDb } from "../../../packages/coach/src/db.js";
import { CoachStore as RealStore } from "../../../packages/coach/src/store.js";
import { CoachStore as PreFixStore } from "./store_prefix.js";

// Verbatim copy of the helper from packages/coach/src/store.test.ts
const tool = (id: string, name: string, description: string): CapabilityEntry => ({
  id,
  kind: "tool",
  source: id.split("__")[0] ?? "src",
  name,
  description,
  inputSchema: { type: "object", properties: { path: { type: "string" } } },
});

function seedAndDraft(StoreCtor: typeof RealStore, label: string): string[] {
  const db = openCoachDb(":memory:");
  const store = new StoreCtor(db);
  // Verbatim from the committed regression test (store.test.ts:357)
  store.upsertCapabilities([
    tool("fs__write_file", "write_file", "write text content to a file on disk"),
    tool("sqlite__write_query", "write_query", "write rows via an insert query"),
    tool("x__unrelated", "unrelated", "totally different domain no overlap"),
  ]);
  const lex = store.lexicalSearch("write", 30);
  // eslint-disable-next-line no-console
  console.log(`\n[${label}] lexicalSearch("write") =`, JSON.stringify(lex));
  const cands = store.draftCandidates("write", 5);
  // eslint-disable-next-line no-console
  console.log(`[${label}] draftCandidates("write",5) =`, JSON.stringify(cands.map((c) => ({ id: c.entry.id, score: c.score, lex: c.lexScore }))));
  return cands.map((c) => c.entry.id);
}

describe("Does store.test.ts:357 actually LOCK the LEX_SCORE_FLOOR fix?", () => {
  it("REAL post-fix code: committed assertions pass", () => {
    const ids = seedAndDraft(RealStore, "POST-FIX");
    expect(ids).toContain("fs__write_file");
    expect(ids).toContain("sqlite__write_query");
  });

  it("PRE-FIX code (only the floor line reverted): do the SAME committed assertions still pass?", () => {
    const ids = seedAndDraft(PreFixStore as unknown as typeof RealStore, "PRE-FIX");
    // These are the EXACT assertions the committed regression test makes.
    // If they pass here, the test does NOT discriminate the floor -> vacuous.
    expect(ids).toContain("fs__write_file");
    expect(ids).toContain("sqlite__write_query");
  });
});
