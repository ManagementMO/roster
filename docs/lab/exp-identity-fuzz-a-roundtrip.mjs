#!/usr/bin/env node
/**
 * identity-fuzz A — namespacedId/parseNamespacedId round-trip fuzz + collision hunt.
 * Real built @rosterhq/shared (dist), no mocks. Deterministic PRNG (seeded).
 * Output: docs/lab/tmp-identity-fuzz/results-a.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const shared = await import(
  createRequire(path.join(repo, "packages/cli/package.json")).resolve("@rosterhq/shared")
);
const { namespacedId, parseNamespacedId, sanitizeSource, sanitizeSegment } = shared;

// ── deterministic PRNG (mulberry32) ─────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0x1057e);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ── fuzz-string generators per charter category ─────────────────────────────
const ASCII = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const UNICODE_POOL = ["日", "本", "語", "é", "ü", "ß", "→", "🚀", "💾", "中", "文", "工", "具", "́", "𝕏", "​"];
const PUNCT = [".", " ", "/", ":", "@", "#", "$", "%", "&", "*", "(", ")", "[", "]", "{", "}", "|", "\\", "'", '"', "`", "~", "+", "=", ",", ";", "<", ">", "?", "!", "\t", "\n"];

function randStr(pool, min, max) {
  const len = min + Math.floor(rnd() * (max - min + 1));
  let s = "";
  for (let i = 0; i < len; i++) s += pick(pool);
  return s;
}
const asciiWord = () => randStr(ASCII.split(""), 1, 8);

const CATEGORIES = {
  unicode: () => randStr([...UNICODE_POOL, ...ASCII.split("").slice(0, 6)], 1, 12),
  spaces: () => [asciiWord(), asciiWord(), asciiWord()].join(pick([" ", "  ", " . ", "\t"])),
  dots: () => [asciiWord(), asciiWord(), asciiWord()].join(pick([".", "..", ".-"])),
  dashes: () => pick(["-", "--", ""]) + [asciiWord(), asciiWord()].join(pick(["-", "--", "---"])) + pick(["-", "--", ""]),
  leadingDigits: () => randStr("0123456789".split(""), 1, 4) + asciiWord(),
  longs: () => randStr([...ASCII.split(""), "_", "-", ".", " "], 180, 220),
  dunderInName: () => asciiWord() + pick(["__", "___", "____"]) + asciiWord(),
  underscoreEdges: () => pick(["_", "__", ""]) + asciiWord() + pick(["_", "__", "___", ""]),
  mixedCase: () => asciiWord().toUpperCase() + asciiWord() + pick(["A", "a"]) + asciiWord().toUpperCase(),
  punct: () => randStr([...ASCII.split("").slice(0, 10), ...PUNCT], 1, 15),
};
const catNames = Object.keys(CATEGORIES);

// ── 1. round-trip fuzz: 1000 pairs (100 per category, source+name from category) ──
const roundtrip = { total: 0, ok: 0, parseNull: [], mismatch: [], invalidChars: [], byCategory: {} };
for (const cat of catNames) {
  const gen = CATEGORIES[cat];
  let catOk = 0;
  for (let i = 0; i < 100; i++) {
    const source = gen();
    const name = catNames[(catNames.indexOf(cat) + 1 + (i % (catNames.length - 1))) % catNames.length] === cat ? gen() : CATEGORIES[pick(catNames)]();
    roundtrip.total++;
    const id = namespacedId(source, name);
    const sSan = sanitizeSource(source);
    const nSan = sanitizeSegment(name);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      roundtrip.invalidChars.push({ cat, source, name, id });
      continue;
    }
    const parsed = parseNamespacedId(id);
    if (parsed === null) {
      roundtrip.parseNull.push({ cat, source: source.slice(0, 40), name: name.slice(0, 40), id: id.slice(0, 60) });
      continue;
    }
    if (parsed.source === sSan && parsed.name === nSan) {
      roundtrip.ok++; catOk++;
    } else {
      if (roundtrip.mismatch.length < 200)
        roundtrip.mismatch.push({
          cat,
          source: source.slice(0, 40), name: name.slice(0, 40),
          sanSource: sSan.slice(0, 40), sanName: nSan.slice(0, 40),
          id: id.slice(0, 80),
          parsedSource: parsed.source.slice(0, 40), parsedName: parsed.name.slice(0, 40),
        });
    }
  }
  roundtrip.byCategory[cat] = { ok: catOk, of: 100 };
}

// ── 2. systematic collision hunt: small alphabet exhaustive ─────────────────
// Alphabet chosen so sanitization boundaries get exercised: underscores, dashes,
// dots, spaces, case. Sources and names of length 1..3 over 7 symbols.
const ALPHA = ["a", "b", "_", "-", ".", " ", "A"];
const strings = [];
for (const c1 of ALPHA) {
  strings.push(c1);
  for (const c2 of ALPHA) {
    strings.push(c1 + c2);
    for (const c3 of ALPHA) strings.push(c1 + c2 + c3);
  }
}
// dedupe raw strings
const uniqStrings = [...new Set(strings)];

const byId = new Map(); // id -> Map(sanKey -> {sanSource,sanName, rawExamples:[]})
let pairCount = 0;
for (const s of uniqStrings) {
  for (const n of uniqStrings) {
    pairCount++;
    const id = namespacedId(s, n);
    const sSan = sanitizeSource(s);
    const nSan = sanitizeSegment(n);
    const sanKey = `${JSON.stringify(sSan)}+${JSON.stringify(nSan)}`;
    let group = byId.get(id);
    if (!group) { group = new Map(); byId.set(id, group); }
    let cell = group.get(sanKey);
    if (!cell) { cell = { sanSource: sSan, sanName: nSan, rawExamples: [] }; group.set(sanKey, cell); }
    if (cell.rawExamples.length < 2) cell.rawExamples.push([s, n]);
  }
}
// cross-boundary collisions: same id, DIFFERENT sanitized (source,name) identity.
const crossBoundary = [];
let crossBoundaryIdCount = 0;
for (const [id, group] of byId) {
  if (group.size > 1) {
    crossBoundaryIdCount++;
    if (crossBoundary.length < 25) {
      crossBoundary.push({
        id,
        identities: [...group.values()].map((c) => ({
          sanSource: c.sanSource, sanName: c.sanName, raw: c.rawExamples[0],
        })),
      });
    }
  }
}
// same-identity raw lossiness (expected sanitizer behavior, reported for scale):
// count ids where >1 distinct RAW (source,name) mapped to one sanitized identity.
let rawLossyIds = 0;
for (const [, group] of byId) {
  for (const cell of group.values()) if (cell.rawExamples.length > 1) { rawLossyIds++; break; }
}

// ── 3. targeted realistic collision families ────────────────────────────────
const families = [];
function fam(label, pairs, note) {
  const ids = pairs.map(([s, n]) => namespacedId(s, n));
  const collide = new Set(ids).size < ids.length;
  families.push({ label, pairs, ids, collide, note });
}
fam("underscore boundary", [["a_", "b"], ["a", "_b"]], "server 'a_' tool 'b' vs server 'a' tool '_b'");
fam("dot vs space vs dash (same server)", [["srv", "b.c"], ["srv", "b c"], ["srv", "b-c"], ["srv", "b--c"]], "distinct tools on ONE server unify");
fam("unicode-only names", [["srv", "工具一"], ["srv", "工具二"], ["srv", "🚀"]], "all-invalid names all become 'x'");
fam("dunder in name vs source underscore", [["a", "b__c"], ["a_b", "c"], ["a_", "b_c"]], "charter's a_b/c vs a/b_c pattern");
fam("trailing punctuation on server", [["github", "create_issue"], ["github.", "create_issue"], ["github ", "create_issue"]], "server aliases unify (raw-lossy, same-side)");
fam("leading digit", [["1srv", "tool"], ["srv", "tool"]], "no collision expected");
fam("case", [["SRV", "tool"], ["srv", "tool"]], "case preserved — no collision expected");
fam("multi-underscore name collapse asymmetry", [["s", "a__b"], ["s", "a_b"]], "name keeps __ — distinct ids expected");

// parse behavior of ids produced by the underscore-boundary family
const boundaryParse = ["a___b", "a__b__c", "s__a__b"].map((id) => ({ id, parsed: parseNamespacedId(id) }));

// ── 4. parseNamespacedId raw-input edges ────────────────────────────────────
const parseEdges = ["", "__", "a__", "__b", "____", "a____b", "_", "a", "a_b", "x__y", "_a__b", "a__b__c__d", "___"].map(
  (id) => ({ id, parsed: parseNamespacedId(id) }),
);
// namespacedId outputs that FAIL to parse (source sanitizing to pure underscore)
const unparseableOutputs = [];
for (const rawSource of ["_", "__", "___", "_-_", "-_-"]) {
  const id = namespacedId(rawSource, "tool");
  const parsed = parseNamespacedId(id);
  unparseableOutputs.push({ rawSource, sanSource: sanitizeSource(rawSource), id, parsed });
}

const out = {
  experiment: "identity-fuzz-a-roundtrip",
  when: new Date().toISOString(),
  roundtrip: {
    total: roundtrip.total,
    ok: roundtrip.ok,
    parseNullCount: roundtrip.parseNull.length,
    mismatchCount: roundtrip.mismatch.length,
    invalidCharCount: roundtrip.invalidChars.length,
    byCategory: roundtrip.byCategory,
    parseNullExamples: roundtrip.parseNull.slice(0, 10),
    mismatchExamples: roundtrip.mismatch.slice(0, 15),
  },
  systematic: {
    alphabet: ALPHA,
    uniqueStrings: uniqStrings.length,
    pairsTested: pairCount,
    distinctIds: byId.size,
    crossBoundaryCollisionIds: crossBoundaryIdCount,
    crossBoundaryExamples: crossBoundary,
    rawLossyIds,
  },
  families,
  boundaryParse,
  parseEdges,
  unparseableOutputs,
};
const outPath = path.join(repo, "docs/lab/tmp-identity-fuzz/results-a.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`round-trip: ${roundtrip.ok}/${roundtrip.total} ok, parseNull=${roundtrip.parseNull.length}, mismatch=${roundtrip.mismatch.length}, invalidChars=${roundtrip.invalidChars.length}`);
console.log(`systematic: ${pairCount} pairs → ${byId.size} ids; cross-boundary collision ids=${crossBoundaryIdCount}; raw-lossy ids=${rawLossyIds}`);
console.log(`families colliding: ${families.filter((f) => f.collide).map((f) => f.label).join(" | ")}`);
console.log(`unparseable namespacedId outputs: ${unparseableOutputs.filter((u) => u.parsed === null).length}/${unparseableOutputs.length}`);
console.log(`wrote ${outPath}`);
