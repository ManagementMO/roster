/**
 * (c) OpenClaw injection-cost formula verification. We build 10 REAL skill files
 * on disk (incl. unicode + empty-desc + nested-dir edge cases), scan them via the
 * real scanSkillLibrary, then check the repo's real openclawInjectionChars()
 * against an INDEPENDENT reimplementation of the documented formula
 *   195 + Σ (97 + len(name) + len(description) + len(filepath))
 * char-for-char per skill. We also verify estimateTokensFromChars, the
 * body-exclusion property, and the single-skill decomposition used by the CLI
 * receipt. Any per-skill delta = formula drift.
 */
import fs from "node:fs";
import path from "node:path";
import { scanSkillLibrary, openclawInjectionChars, skillToCapabilityEntry, estimateTokensFromChars, freshDir, writeSkillRaw, writeResult, repo } from "./exp-playbook-trust-lib.mjs";

const BASE = 195, PER = 97;
const mk = (name, desc, body) => `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}\n`;

// 10 real skills spanning realistic shapes + edge cases that could drift .length
const SKILLS = [
  ["tdd", "test-driven-development", "Drive features via the red-green-refactor loop.", "body one"],
  ["debug", "systematic-debugging", "Find and fix the true root cause of a bug.", "body two here longer"],
  ["pdf", "pdf-tools", "Fill, merge, and extract text from PDF forms.", "b"],
  ["review", "code-review", "Review a diff for correctness and clarity.", "b"],
  ["empty-desc", "no-desc-skill", "", "a skill with an empty description falls back to 'Skill: <name>' in the entry but contributes 0 desc chars to injection"],
  ["emoji", "🚀 rocket-deploy", "Deploys with a 🚀 and 汉字 in the description", "unicode surfaces .length (UTF-16 units) vs byte drift"],
  ["long-desc", "long-description-skill", "x".repeat(300), "b"],
  ["nested", "nested-name", "desc for a deeper directory to lengthen filepath", "b"],
  ["short", "s", "d", "b"],
  ["writing", "technical-writing", "Write clear docs and changelogs.", "b"],
];

const lib = freshDir("openclaw");
for (const [slug, name, desc, body] of SKILLS) writeSkillRaw(lib, slug, mk(name, desc, body));
const scanned = scanSkillLibrary(lib);

// Independent formula (deliberately NOT importing the constant from the module)
const perSkillExpected = (s) => {
  const filepath = `${s.dir}/SKILL.md`;
  return PER + s.name.length + s.description.length + filepath.length;
};
const independentTotal = (skills) => (skills.length === 0 ? 0 : BASE + skills.reduce((a, s) => a + perSkillExpected(s), 0));

// Per-skill and total comparison
const perSkill = scanned.map((s) => {
  const filepath = `${s.dir}/SKILL.md`;
  return {
    slug: s.slug, name: s.name, nameLen: s.name.length, descLen: s.description.length,
    filepath, filepathLen: filepath.length,
    // single-skill injection chars via the REAL function (isolate this skill)
    realSingle: openclawInjectionChars([s]),
    expectedSingle: BASE + perSkillExpected(s),
  };
});

const realTotal = openclawInjectionChars(scanned);
const expTotal = independentTotal(scanned);
const totalMatch = realTotal === expTotal;
const perSkillMismatches = perSkill.filter((p) => p.realSingle !== p.expectedSingle);

// estimateTokensFromChars: verify ceil(chars/4) and the receipt pairing
const estTokens = estimateTokensFromChars(realTotal);
const estOk = estTokens === Math.ceil(realTotal / 4);

// body-exclusion property: mutating body must NOT change injection chars
const beforeBody = openclawInjectionChars(scanned);
const withFatBody = scanned.map((s) => ({ ...s, body: s.body + "Z".repeat(100000) }));
const afterBody = openclawInjectionChars(withFatBody);
const bodyExcluded = beforeBody === afterBody;

// empty list → 0
const emptyZero = openclawInjectionChars([]) === 0;

// Reconstruct a REPRESENTATIVE <available_skills> block to interrogate whether
// the 97-char per-skill structural constant is defensible. This is a plausible
// XML rendering — OpenClaw's exact template is NOT vendored in this repo, so
// "EXACT" (per the doc-comment) is asserted, not independently verifiable here.
const renderCandidate = (s) => {
  const filepath = `${s.dir}/SKILL.md`;
  // a plausible per-skill block; structural (non-content) chars are what "97" claims to be
  return `<skill>\n  <name>${s.name}</name>\n  <description>${s.description}</description>\n  <location>${filepath}</location>\n</skill>\n`;
};
const sampleSkill = scanned[0];
const candidateBlock = renderCandidate(sampleSkill);
const candidateStructuralChars = candidateBlock.length - (sampleSkill.name.length + sampleSkill.description.length + (`${sampleSkill.dir}/SKILL.md`).length);

const summary = {
  skillsMeasured: scanned.length,
  realTotalChars: realTotal,
  independentTotalChars: expTotal,
  totalMatch,
  perSkillMismatches: perSkillMismatches.length,
  perSkillMismatchDetail: perSkillMismatches,
  driftChars: realTotal - expTotal,
  estTokens,
  estTokensFormulaOk: estOk,
  bodyExcludedFromInjection: bodyExcluded,
  emptyListZero: emptyZero,
  constants: { BASE_OVERHEAD_CHARS: BASE, PER_SKILL_OVERHEAD_CHARS: PER },
  unicodeNote: "openclawInjectionChars uses String.length (UTF-16 code units). '🚀' = 2 units, 1 code point, 4 UTF-8 bytes; CJK = 1 unit, 3 bytes. If OpenClaw's real renderer counts bytes or code points, multibyte names/paths drift from this count (within the ±15% token estimate either way).",
  exactnessCaveat: {
    claim: "openclaw.ts doc-comment + receipt.ts methodology call this the EXACT char count of OpenClaw's <available_skills> block (no estimation caveat on chars).",
    verifiable_in_repo: false,
    reason: "OpenClaw's real <available_skills> template is not vendored in this repo, so the 195/97 structural constants cannot be checked against the true renderer here — only internal code-vs-documented-formula consistency can.",
    representativeBlockStructuralChars: candidateStructuralChars,
    representativeBlockNote: `A plausible XML per-skill block yields ${candidateStructuralChars} structural chars vs the asserted 97 — the exact number depends entirely on OpenClaw's real template (indentation, tag names, separators).`,
  },
};

const out = { generatedAt: new Date().toISOString(), summary, perSkill };
const p = writeResult("c-openclaw", out);
fs.rmSync(path.join(repo, "docs/lab/tmp-playbook-trust/openclaw"), { recursive: true, force: true });
console.log(`[c-openclaw] skills=${scanned.length} realTotal=${realTotal} independent=${expTotal} match=${totalMatch} drift=${realTotal - expTotal}`);
console.log(`[c-openclaw] perSkillMismatches=${perSkillMismatches.length} estTokens=${estTokens} estOk=${estOk} bodyExcluded=${bodyExcluded} emptyZero=${emptyZero}`);
console.log(`[c-openclaw] representative-block structural chars=${candidateStructuralChars} (asserted constant=97; exact template not in-repo)`);
console.log(`[c-openclaw] → ${p}`);
