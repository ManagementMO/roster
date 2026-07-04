#!/usr/bin/env node
/**
 * exp-token-economics-pretty — does pretty-printing the draft response
 * actually cost REAL tokens, or only chars/4-estimated ones?
 * Uses the ACTUAL wire texts captured by exp-token-economics.mjs and the
 * same two real tokenizers. Merges results into results-token-economics.json.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const coachReq = createRequire(path.join(repo, "packages/coach/package.json"));
const { AutoTokenizer } = await import(coachReq.resolve("@huggingface/transformers"));
const { estimateTokensFromChars } = await import(
  createRequire(path.join(repo, "packages/cli/package.json")).resolve("@rosterhq/shared")
);

const TMP = path.join(here, "tmp-token-economics");
const wires = JSON.parse(fs.readFileSync(path.join(TMP, "live-draft-wires.json"), "utf8"));
const OUT = path.join(here, "results-token-economics.json");
const results = JSON.parse(fs.readFileSync(OUT, "utf8"));

const miniTok = await AutoTokenizer.from_pretrained("Xenova/all-MiniLM-L6-v2");
const claudeTok = await AutoTokenizer.from_pretrained("Xenova/claude-tokenizer");
const specials = (tok) => tok.encode("").length;
const count = (tok, text) => tok.encode(text).length - specials(tok);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const rows = wires.map((w) => {
  const compact = JSON.stringify(JSON.parse(w.text));
  return {
    wire: { chars: w.text.length, est: estimateTokensFromChars(w.text.length), minilm: count(miniTok, w.text), claudeLegacy: count(claudeTok, w.text) },
    compact: { chars: compact.length, est: estimateTokensFromChars(compact.length), minilm: count(miniTok, compact), claudeLegacy: count(claudeTok, compact) },
  };
});
const overhead = (k) => +((mean(rows.map((r) => r.wire[k])) / mean(rows.map((r) => r.compact[k])) - 1) * 100).toFixed(1);
const summary = {
  n: rows.length,
  meanWire: { est: +mean(rows.map((r) => r.wire.est)).toFixed(1), minilm: +mean(rows.map((r) => r.wire.minilm)).toFixed(1), claudeLegacy: +mean(rows.map((r) => r.wire.claudeLegacy)).toFixed(1) },
  meanCompact: { est: +mean(rows.map((r) => r.compact.est)).toFixed(1), minilm: +mean(rows.map((r) => r.compact.minilm)).toFixed(1), claudeLegacy: +mean(rows.map((r) => r.compact.claudeLegacy)).toFixed(1) },
  prettyOverheadPct: { est: overhead("est"), minilm: overhead("minilm"), claudeLegacy: overhead("claudeLegacy") },
  note: "overhead of JSON.stringify(payload,null,2) vs compact on the 13 real live draft wires, per tokenizer",
};
results.C_tokenizer.prettyPrintRealCost = summary;
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(summary, null, 2));
