#!/usr/bin/env node
/**
 * exp-classifier-realworld part (b): precedence fuzz on the REAL built
 * classifyOutcome/isAttributable from @rosterhq/coach dist.
 *
 * b1 — 500 seeded-random CallEvidence combos: verify class always follows the
 *      spec precedence transport > protocol > timeout > isError-kinds > drift
 *      > success, and that every emitted class is attributable per
 *      methodology §8 (non-attributable rows only ever come from the
 *      soft_fail/explored markers, never from evidence).
 * b2 — 500 seeded-random error TEXTS composed of shuffled kind-trigger
 *      phrases: verify kind precedence is fixed by rule order
 *      (auth > quota > timeout > schema > internal > other) regardless of
 *      word position in the text.
 *
 * Output: docs/lab/tmp-classifier-realworld/out-fuzz.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { classifyOutcome, classifyToolFailKind, isAttributable } = await import(
  req.resolve("@rosterhq/coach")
);

// deterministic PRNG (mulberry32) so the fuzz is reproducible
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260704);

const TEXT_POOL = [
  undefined,
  "",
  "unauthorized",
  "rate limit exceeded",
  "timed out",
  "validation failed: required parameter missing",
  "internal server error",
  "something odd happened",
  "Unexpected token < in JSON at position 0",
  "quota exceeded AND permission denied", // multi-trigger
];

// ORACLE written straight from handoff §6.2's stated precedence
function oracleClass(e) {
  if (e.transportError) return "hard_fail:transport";
  if (e.protocolError) return "hard_fail:protocol";
  if (e.timedOut) return "tool_fail:timeout";
  if (e.isError) return `tool_fail:${classifyToolFailKind(e.errorText ?? "")}`;
  if (e.outputSchemaViolation) return "schema_drift_suspect";
  return "success";
}

const N = 500;
let mismatches = [];
let nonAttributable = [];
const classCounts = {};
for (let i = 0; i < N; i++) {
  const e = {};
  if (rand() < 0.4) e.transportError = rand() < 0.7;
  if (rand() < 0.4) e.protocolError = rand() < 0.7;
  if (rand() < 0.4) e.timedOut = rand() < 0.7;
  if (rand() < 0.5) e.isError = rand() < 0.7;
  if (rand() < 0.6) e.errorText = TEXT_POOL[Math.floor(rand() * TEXT_POOL.length)];
  if (rand() < 0.4) e.outputSchemaViolation = rand() < 0.7;
  const got = classifyOutcome(e);
  const want = oracleClass(e);
  classCounts[got] = (classCounts[got] ?? 0) + 1;
  if (got !== want) mismatches.push({ i, evidence: e, got, want });
  if (!isAttributable(got)) nonAttributable.push({ i, evidence: e, got });
}

// b2: kind precedence with shuffled multi-trigger texts
const KIND_TRIGGERS = [
  ["auth", "unauthorized access"],
  ["quota", "rate limit exceeded"],
  ["timeout", "request timed out"],
  ["schema", "validation failed for field"],
  ["internal", "internal server error"],
];
const KIND_ORDER = ["auth", "quota", "timeout", "schema", "internal"];
let kindMismatches = [];
const M = 500;
for (let i = 0; i < M; i++) {
  const k = 1 + Math.floor(rand() * 3);
  const picked = [...KIND_TRIGGERS].sort(() => rand() - 0.5).slice(0, k);
  const text = picked.map((p) => p[1]).sort(() => rand() - 0.5).join("; and then ");
  const present = picked.map((p) => p[0]);
  const want = KIND_ORDER.find((kk) => present.includes(kk)); // first in RULE order, not text order
  const got = classifyToolFailKind(text);
  if (got !== want) kindMismatches.push({ i, text, present, got, want });
}

// isAttributable table over every legal OutcomeClass + the two marker concepts
const attrTable = Object.fromEntries(
  [
    "success",
    "hard_fail:transport",
    "hard_fail:protocol",
    "tool_fail:auth",
    "tool_fail:quota",
    "tool_fail:schema",
    "tool_fail:timeout",
    "tool_fail:internal",
    "tool_fail:other",
    "schema_drift_suspect",
    "soft_fail", // marker, not a class — must NOT be attributable if it ever leaked in
    "explored", // ditto
  ].map((c) => [c, isAttributable(c)]),
);

const out = {
  experiment: "classifier-realworld part (b) — precedence fuzz on built dist",
  when: new Date().toISOString(),
  seedNote: "mulberry32 seed 20260704 — reproducible",
  b1: {
    n: N,
    precedenceMismatches: mismatches.length,
    mismatchSamples: mismatches.slice(0, 5),
    nonAttributableEmitted: nonAttributable.length,
    nonAttributableSamples: nonAttributable.slice(0, 5),
    classDistribution: classCounts,
  },
  b2: {
    n: M,
    kindPrecedenceMismatches: kindMismatches.length,
    mismatchSamples: kindMismatches.slice(0, 8),
  },
  attrTable,
};
const TMP = path.join(repo, "docs/lab/tmp-classifier-realworld");
fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(TMP, "out-fuzz.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.b1, null, 2).slice(0, 800));
console.log(`b2 kind mismatches: ${kindMismatches.length}/${M}`);
if (kindMismatches.length) console.log(JSON.stringify(kindMismatches.slice(0, 8), null, 2));
console.log(`attrTable: ${JSON.stringify(attrTable)}`);
console.log(`wrote ${path.join(TMP, "out-fuzz.json")}`);
