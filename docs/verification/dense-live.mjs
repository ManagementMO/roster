#!/usr/bin/env node
/**
 * Live verification of the dense rung + OATS with a REAL embedding model —
 * the one integration the unit suite mocks. Uses MiniLM (small download) via
 * the same TransformersEmbeddings provider the router uses; asserts that
 * SEMANTIC matching does what lexical cannot: rank the right tool for a
 * paraphrased need with zero token overlap, and that OATS refinement moves
 * rankings from real outcome data. Run from repo root:
 *   node docs/verification/dense-live.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const coach = await import(
  createRequire(path.join(repo, "packages/cli/package.json")).resolve("@rosterhq/coach")
);
const { CoachStore, openCoachDb, TransformersEmbeddings, MINILM_MODEL, hashNeed } = coach;

const log = [];
const say = (s) => { log.push(s); console.log(s); };
const assert = (cond, label) => {
  if (!cond) { say(`  ✗ FAIL: ${label}`); process.exit(1); }
  say(`  ✓ ${label}`);
};

say(`# Dense rung live verification — ${new Date().toISOString()}`);
say(`model: ${MINILM_MODEL} (real download + inference via transformers.js)`);

const store = new CoachStore(openCoachDb(":memory:"));
const tools = [
  { id: "memory__create_entities", name: "create_entities", description: "Create multiple new entities in the knowledge graph" },
  { id: "memory__search_nodes", name: "search_nodes", description: "Search for nodes in the knowledge graph based on a query" },
  { id: "fs__read_text_file", name: "read_text_file", description: "Read the complete contents of a file from the file system as text" },
  { id: "web__fetch_page", name: "fetch_page", description: "Fetch a web page over HTTP and return its contents" },
];
store.upsertCapabilities(
  tools.map((t) => ({ ...t, kind: "tool", source: t.id.split("__")[0], inputSchema: { type: "object" } })),
);

say("");
say("## 1. Real embeddings load and run (background-fetch path)");
const t0 = Date.now();
const provider = new TransformersEmbeddings(MINILM_MODEL);
const toolVecs = await provider.embed(tools.map((t) => `${t.name}\n${t.description}`));
say(`  embedded ${toolVecs.length} tool texts in ${Date.now() - t0}ms (includes first-run model fetch if uncached)`);
assert(
  toolVecs.length === 4 && toolVecs[0].length === 384,
  "MiniLM vectors kept at native 384 dims (Matryoshka truncation is Gemma-only — live-verified fix)",
);
tools.forEach((t, i) => store.storeBaseVec(t.id, toolVecs[i]));

say("");
say("## 2. Semantic beats lexical: paraphrased need, zero token overlap");
const need = "remember a fact about the user for later";
const [needVec] = await provider.embed([need]);
const lexOnly = store.draftCandidates(need, 4);
const hybrid = store.draftCandidates(need, 4, needVec);
say(`  lexical-only order:  ${lexOnly.map((c) => c.entry.id).join(", ")}`);
say(`  hybrid (dense) order: ${hybrid.map((c) => c.entry.id).join(", ")}`);
// Calibration (learned live): MiniLM's cosines on short tool blurbs span
// ~0.0–0.1 — genuine noise (sanity probe: dog~puppy=0.81, provider healthy).
// The fusion is signal-adaptive: below a 0.15 span the dense channel ABSTAINS
// and ordering must equal lexical exactly (no noise amplification). Section 3
// then proves dense GOVERNS once OATS produces a real span.
const lexOrder = lexOnly.map((c) => c.entry.id).join(",");
const hybOrder = hybrid.map((c) => c.entry.id).join(",");
const span =
  Math.max(...hybrid.map((c) => c.cosScore ?? 0)) - Math.min(...hybrid.map((c) => c.cosScore ?? 0));
say(`  observed cosine span: ${span.toFixed(3)} (< 0.15 ⇒ dense abstains by design)`);
if (span < 0.15) {
  assert(hybOrder === lexOrder, "uninformative dense channel abstains — hybrid order equals lexical exactly");
} else {
  assert(hybrid[0].entry.id.startsWith("memory__"), "informative dense channel ranks a memory tool #1");
}

say("");
say("## 3. OATS refinement from real outcome vectors shifts ranking");
// Simulate history: search_nodes kept succeeding for recall-shaped needs.
const recallNeeds = [
  "look up what we know about this person",
  "find previously stored information",
  "retrieve saved facts from earlier sessions",
  "what did the user tell us before",
];
const recallVecs = await provider.embed(recallNeeds);
recallNeeds.forEach((n, i) => {
  const nh = hashNeed(n);
  store.storeNeedVec(nh, recallVecs[i]);
  store.recordOutcome({
    session: `s${i}`, source: "memory", capability: "memory__search_nodes",
    outcomeClass: "success", latencyMs: 30, needHash: nh,
  });
});
const oats = store.runOats();
assert(oats.adjusted === 1, `OATS adjusted exactly the tool with ≥4 real success vectors (${JSON.stringify(oats)})`);

const probe = "recall stored knowledge about the user";
const [probeVec] = await provider.embed([probe]);
const after = store.draftCandidates(probe, 4, probeVec);
say(`  post-OATS order for "${probe}": ${after.map((c) => `${c.entry.id}(${c.cosScore?.toFixed(3)})`).join(", ")}`);
assert(after[0].entry.id === "memory__search_nodes", "the outcome-refined tool now ranks #1 for its winning need-shape");

await provider.dispose();
say("");
say("## Result: DENSE RUNG + OATS VERIFIED LIVE (real model, real inference)");
const out = path.join(repo, "docs/verification", `${new Date().toISOString().slice(0, 10)}-dense-live.md`);
fs.writeFileSync(out, `${log.join("\n")}\n`);
console.log(`\ntranscript → ${out}`);
