/**
 * E3 addendum — differential fuzz of the destructive-command candidates against
 * an INDEPENDENT oracle.
 *
 * The hand-built corpora are 42 must-flag + 36 must-not-flag items that I chose;
 * a "0 false positives" claim on my own list is weak. This generates hundreds of
 * thousands of shell-ish lines from a component grammar and grades every pattern
 * against an oracle written as a getopt-style TOKENIZER over the generated
 * components (not over the regex's assumptions), so precision/recall are
 * measured on inputs nobody hand-picked.
 *
 * The oracle encodes GNU rm's actual option grammar, verified against
 * `rm (GNU coreutils) 9.4` in this sandbox:
 *   rm --recursive --force D -> deleted      rm --recu --forc D -> deleted
 *   rm --r --f D            -> deleted      rm --x -> "unrecognized option"
 * i.e. any UNAMBIGUOUS PREFIX of a long option is accepted.
 *
 * Oracle scope deliberately matches the rule's DOCUMENTED scope: a literal
 * target beginning with `~` or `/`. Quoted (`'/'`) and variable (`"$HOME"`)
 * targets are out of scope for both the shipped rule and the candidates, and are
 * reported separately rather than scored.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const REPO = "/tmp/roster-post-round5-closure";
const OUT_DIR = "/tmp/claude-0/-home-user-roster/c85b98df-18e8-5308-a861-b4353c52ba11/scratchpad";
const N = Number(process.env.E3_FUZZ_N ?? 500000);

const require_ = createRequire(path.join(REPO, "packages/cli/package.json"));
const playbookEntry = require_.resolve("@rosterhq/playbook");
const { TRUST_RULES } = await import(`file://${path.join(path.dirname(playbookEntry), "trust.js")}`);
const SHIPPED = TRUST_RULES.find((r) => r.id === "destructive-command").pattern;

const SEP_CONT = /(?:[ \t]|\\\r?\n)+/;
const SEP_FAST = /[ \t]+(?:\\\r?\n[ \t]+)*/;
const SEP_PLAIN = /[ \t]+/;
const FLAG_ANY = /-[-A-Za-z0-9=]+/;
const FLAG_OPT = /--?[A-Za-z0-9][-A-Za-z0-9=]*/;
function longPrefix(word) {
  let inner = "";
  for (let i = word.length - 1; i >= 1; i--) inner = `(?:${word[i]}${inner})?`;
  return `-${word[0]}${inner}(?![-\\w])`;
}
function build({ start, sep, rLong, fLong, target, flag = FLAG_ANY, endOpt = false }) {
  const s = sep.source;
  const region = `(?:${s}${flag.source})`;
  return new RegExp(
    `${start}(?=${region}*${s}-(?:[a-z]*r|${rLong}))(?=${region}*${s}-(?:[a-z]*f|${fLong}))(?=(${region}+))\\1` +
      (endOpt ? `(?:${s}--)?` : "") +
      `${s}${target}`,
    "i",
  );
}
const CANDIDATES = {
  shipped: SHIPPED,
  C1_strict_wb: build({ start: "\\brm", sep: SEP_PLAIN, rLong: "-recursive", fLong: "-force", target: "[~/]" }),
  C2_prefix_wb: build({ start: "\\brm", sep: SEP_PLAIN, rLong: "-r", fLong: "-f", target: "[~/]" }),
  C3_prefix_cmdpos: build({ start: "(?<![-\\w=])rm", sep: SEP_PLAIN, rLong: "-r", fLong: "-f", target: "[~/]" }),
  C4_primary: build({ start: "(?<![-\\w=])rm", sep: SEP_CONT, rLong: "-r", fLong: "-f", target: "[~/]" }),
  C5_quoted_target: build({ start: "(?<![-\\w=])rm", sep: SEP_CONT, rLong: "-r", fLong: "-f", target: "[\"']?[~/]" }),
  C6_endopt: build({ start: "(?<![-\\w=])rm", sep: SEP_CONT, rLong: "-r", fLong: "-f", target: "[~/]", flag: FLAG_OPT, endOpt: true }),
  C7_exact_prefix: build({ start: "(?<![-\\w=])rm", sep: SEP_CONT, rLong: longPrefix("recursive"), fLong: longPrefix("force"), target: "[~/]", flag: FLAG_OPT, endOpt: true }),
  C8_final: build({ start: "(?<![-\\w=])rm", sep: SEP_FAST, rLong: longPrefix("recursive"), fLong: longPrefix("force"), target: "[~/]", flag: FLAG_OPT, endOpt: true }),
};

// ---------------------------------------------------------------------------
// Grammar components
// ---------------------------------------------------------------------------
// isCmd: does this leading token leave `rm` in a command position?
const HEADS = [
  { text: "rm", isRm: true },
  { text: "RM", isRm: true },
  { text: "/bin/rm", isRm: true },
  { text: "sudo rm", isRm: true },
  { text: "git rm", isRm: true },
  { text: "`rm", isRm: true },
  { text: "$(rm", isRm: true },
  { text: "rmdir", isRm: false },
  { text: "warm", isRm: false },
  { text: "alarm", isRm: false },
  { text: "charm", isRm: false },
  { text: "confirm-rm", isRm: false },
  { text: "--rm", isRm: false }, // rm inside a long flag
  { text: "TOOL=rm", isRm: false }, // rm as an assignment value
  { text: "--exec=rm", isRm: false },
  { text: "docker run --rm", isRm: false },
  { text: "npm-rm", isRm: false },
];

// GNU rm long options (coreutils 9.4). Prefix matching is by startsWith.
const RM_LONG = [
  "force",
  "interactive",
  "one-file-system",
  "no-preserve-root",
  "preserve-root",
  "recursive",
  "dir",
  "verbose",
  "help",
  "version",
];
const FLAGS = [
  "-r",
  "-f",
  "-rf",
  "-fr",
  "-R",
  "-F",
  "-v",
  "-i",
  "-d",
  "-rfv",
  "-vrf",
  "-xrfy",
  "-rrr",
  "-fff",
  "-x",
  "--recursive",
  "--force",
  "--recu",
  "--forc",
  "--r",
  "--f",
  "--verbose",
  "--one-file-system",
  "--no-preserve-root",
  "--preserve-root=all",
  "--interactive=never",
  "--reflink=always", // NOT an rm option: --r… that is not a prefix of "recursive"
  "--fsync", // NOT an rm option: --f… that is not a prefix of "force"
  "--",
];
const SEPS = [" ", "  ", "\t", " \t ", "   ", " \\\n  ", "\n"];
const TARGETS = [
  { text: "/", kind: "root" },
  { text: "~", kind: "home" },
  { text: "/home/u", kind: "root" },
  { text: "~/x", kind: "home" },
  { text: "/tmp/y", kind: "root" },
  { text: "./build", kind: "rel" },
  { text: "dist", kind: "rel" },
  { text: "node_modules", kind: "rel" },
  { text: ".", kind: "rel" },
  { text: "file.txt", kind: "rel" },
  { text: "$HOME", kind: "var" },
  { text: '"$TMPDIR"/x', kind: "var" },
  { text: "${BUILD}/o", kind: "var" },
  { text: "'/'", kind: "quoted" },
  { text: '"/"', kind: "quoted" },
  { text: "{}", kind: "rel" },
  { text: "", kind: "none" },
];
const PREFIXES = ["", "sudo ", "# ", "echo ", "never run ", "  ", "&& ", "Run: ", "|| "];
const SUFFIXES = ["", " && echo ok", "\nnext line here", " # cleanup", "\n"];

// ---------------------------------------------------------------------------
// Oracle: does the generated text contain an rm invocation with BOTH recursive
// and force in effect and a literal ~ or / target?
// ---------------------------------------------------------------------------
function oracle(g, opts = {}) {
  // opts.caseInsensitiveShortFlags: treat `-F` as force / `-R` as recursive the
  // way an /i regex does. Used ONLY to attribute residual FPs, never to score.
  if (!g.head.isRm) return false;
  // A bare newline anywhere before the target severs the command.
  const seps = g.seps;
  for (let i = 0; i < seps.length; i++) if (seps[i].includes("\n") && !seps[i].includes("\\")) return false;
  let recursive = false;
  let force = false;
  let endOfOptions = false;
  let target = null;
  const operands = [];
  for (const tok of g.flags) {
    if (endOfOptions) {
      operands.push(tok);
      continue;
    }
    if (tok === "--") {
      endOfOptions = true;
      continue;
    }
    if (tok.startsWith("--")) {
      const name = tok.slice(2).split("=")[0];
      const hits = RM_LONG.filter((o) => o.startsWith(name));
      if (hits.length !== 1) continue; // unrecognized / ambiguous: rm would abort
      if (hits[0] === "recursive") recursive = true;
      if (hits[0] === "force") force = true;
      continue;
    }
    // short cluster
    for (const ch of tok.slice(1)) {
      if (ch === "r" || ch === "R") recursive = true;
      else if (ch === "f" || (opts.caseInsensitiveShortFlags && ch === "F")) force = true;
    }
  }
  if (g.target.text !== "") operands.push(g.target.text);
  target = operands[0] ?? null;
  if (target === null) return false;
  if (!(target.startsWith("~") || target.startsWith("/"))) return false;
  return recursive && force;
}

// ---------------------------------------------------------------------------
// Generate + grade
// ---------------------------------------------------------------------------
let s = 0x9e3779b9;
const rnd = () => {
  s ^= s << 13;
  s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5;
  s >>>= 0;
  return s / 4294967296;
};
const pick = (a) => a[(rnd() * a.length) | 0];

function gen() {
  const head = pick(HEADS);
  const nFlags = (rnd() * 5) | 0; // 0..4
  const flags = [];
  for (let i = 0; i < nFlags; i++) flags.push(pick(FLAGS));
  const target = pick(TARGETS);
  const seps = [];
  for (let i = 0; i < flags.length + 1; i++) seps.push(pick(SEPS));
  const prefix = pick(PREFIXES);
  const suffix = pick(SUFFIXES);
  let text = prefix + head.text;
  for (let i = 0; i < flags.length; i++) text += seps[i] + flags[i];
  text += seps[flags.length] + target.text;
  text += suffix;
  return { head, flags, target, seps, prefix, suffix, text };
}

const names = Object.keys(CANDIDATES);
const score = {};
for (const n of names) score[n] = { tp: 0, fp: 0, tn: 0, fn: 0, fpExamples: [], fnExamples: [], fpCauses: {}, fpExplainedByCaseInsensitivity: 0 };

/**
 * Why did a pattern fire on an oracle-negative? Ordered most-specific first, so
 * each FP is attributed to exactly one root cause.
 */
function fpCause(g) {
  if (!g.head.isRm) return "rm-not-in-command-position";
  if (g.seps.some((x) => x.includes("\n") && !x.includes("\\"))) return "crosses-a-bare-newline";
  if (g.target.kind === "quoted") return "quoted-target-out-of-scope";
  if (g.target.kind === "var") return "variable-target-out-of-scope";
  const dd = g.flags.indexOf("--");
  if (dd !== -1 && dd < g.flags.length - 1) return "flags-after-end-of-options-are-operands";
  const bogusLong = g.flags.some((f) => f === "--reflink=always" || f === "--fsync");
  if (bogusLong) return "long-option-not-a-prefix-of-recursive/force";
  const upperF = g.flags.some((f) => /^-[A-Za-z]*F/.test(f) && !f.startsWith("--"));
  if (upperF) return "uppercase--F-counted-as-force (case-insensitive rule)";
  return "other";
}
const outOfScopeTargetHits = {};
for (const n of names) outOfScopeTargetHits[n] = { quoted: 0, var: 0 };
const paired = []; // per-item correctness for shipped vs each candidate
let positives = 0;
const seenFp = new Set();
const seenFn = new Set();

for (let i = 0; i < N; i++) {
  const g = gen();
  const truth = oracle(g);
  const truthCaseInsens = oracle(g, { caseInsensitiveShortFlags: true });
  if (truth) positives++;
  const row = { truth };
  for (const n of names) {
    const re = CANDIDATES[n];
    re.lastIndex = 0;
    const got = re.test(g.text);
    row[n] = got;
    const sc = score[n];
    if (truth && got) sc.tp++;
    else if (truth && !got) {
      sc.fn++;
      const key = `${g.head.text}|${g.flags.join(",")}|${g.target.text}|${g.seps.join("¦")}`;
      if (!seenFn.has(n + key) && sc.fnExamples.length < 25) {
        seenFn.add(n + key);
        sc.fnExamples.push(JSON.stringify(g.text));
      }
    } else if (!truth && got) {
      sc.fp++;
      const cause = fpCause(g);
      sc.fpCauses[cause] = (sc.fpCauses[cause] ?? 0) + 1;
      // Ablation attribution: would this FP vanish if the rule were
      // case-SENSITIVE about the short force flag? (i.e. is it explained purely
      // by the /i flag the SHIPPED rule already carries?)
      if (truthCaseInsens) sc.fpExplainedByCaseInsensitivity++;
      const key = `${g.head.text}|${g.flags.join(",")}|${g.target.text}`;
      if (!seenFp.has(n + key) && sc.fpExamples.length < 25) {
        seenFp.add(n + key);
        sc.fpExamples.push(JSON.stringify(g.text));
      }
      if (g.target.kind === "quoted") outOfScopeTargetHits[n].quoted++;
      if (g.target.kind === "var") outOfScopeTargetHits[n].var++;
    } else sc.tn++;
  }
  paired.push(row);
}

// exact McNemar + paired bootstrap over fuzz items, shipped vs each candidate
function exactMcNemar(b, c) {
  const n = b + c;
  if (n === 0) return { b, c, n, pTwoSided: 1 };
  // normal approximation is fine at these counts; report the continuity-corrected chi2
  const chi2 = (Math.abs(b - c) - 1) ** 2 / n;
  // two-sided p from chi2 with 1 df
  const p = Math.exp(-chi2 / 2) * (chi2 > 30 ? 0 : 1); // crude; only used when tiny
  return { b, c, n, chi2: +chi2.toFixed(1), pTwoSidedApprox: chi2 > 30 ? "<1e-7" : p.toExponential(2) };
}
function bootstrap(pairs, key, reps = 10000) {
  let t = 0x1234567;
  const r = () => {
    t ^= t << 13;
    t >>>= 0;
    t ^= t >>> 17;
    t ^= t << 5;
    t >>>= 0;
    return t / 4294967296;
  };
  const n = pairs.length;
  const M = Math.min(n, 20000); // resample size = min(n, 20k) for tractability
  const diffs = [];
  for (let k = 0; k < reps; k++) {
    let a = 0;
    let b = 0;
    for (let j = 0; j < M; j++) {
      const p = pairs[(r() * n) | 0];
      a += p.shippedCorrect;
      b += p[key];
    }
    diffs.push((b - a) / M);
  }
  diffs.sort((x, y) => x - y);
  const q = (u) => diffs[Math.round(u * (diffs.length - 1))];
  return { reps, resampleSize: M, ci95: [+q(0.025).toFixed(5), +q(0.975).toFixed(5)] };
}

const pairedCorrect = paired.map((row) => {
  const o = { shippedCorrect: row.shipped === row.truth ? 1 : 0 };
  for (const n of names) if (n !== "shipped") o[n] = row[n] === row.truth ? 1 : 0;
  return o;
});
const stats = {};
for (const n of names) {
  if (n === "shipped") continue;
  const b = pairedCorrect.filter((p) => p[n] === 1 && p.shippedCorrect === 0).length;
  const c = pairedCorrect.filter((p) => p.shippedCorrect === 1 && p[n] === 0).length;
  const pointDelta =
    pairedCorrect.reduce((a, p) => a + p[n], 0) / pairedCorrect.length -
    pairedCorrect.reduce((a, p) => a + p.shippedCorrect, 0) / pairedCorrect.length;
  stats[n] = {
    accuracyShipped: +(pairedCorrect.reduce((a, p) => a + p.shippedCorrect, 0) / pairedCorrect.length).toFixed(5),
    accuracyCandidate: +(pairedCorrect.reduce((a, p) => a + p[n], 0) / pairedCorrect.length).toFixed(5),
    pointDelta: +pointDelta.toFixed(5),
    mcnemar: exactMcNemar(b, c),
    bootstrapCi95: bootstrap(pairedCorrect, n).ci95,
  };
}

const summary = {};
for (const n of names) {
  const sc = score[n];
  summary[n] = {
    tp: sc.tp,
    fn: sc.fn,
    fp: sc.fp,
    tn: sc.tn,
    recall: +(sc.tp / (sc.tp + sc.fn || 1)).toFixed(5),
    precision: +(sc.tp / (sc.tp + sc.fp || 1)).toFixed(5),
    fpr: +(sc.fp / (sc.fp + sc.tn || 1)).toFixed(5),
    outOfScopeTargetPortionOfFp: outOfScopeTargetHits[n],
    fpCauses: sc.fpCauses,
    fpExplainedByCaseInsensitivity: sc.fpExplainedByCaseInsensitivity,
    fpNotExplainedByCaseInsensitivity: sc.fp - sc.fpExplainedByCaseInsensitivity,
    fpExamples: sc.fpExamples,
    fnExamples: sc.fnExamples,
  };
}

const out = {
  experiment: "E3 fuzz — destructive-command candidates vs independent getopt oracle",
  n: N,
  positivesInSample: positives,
  rmVersionProbe: "GNU coreutils 9.4: `rm --r --f DIR` deletes; `rm --x` unrecognized (prefix rule confirmed)",
  patterns: Object.fromEntries(Object.entries(CANDIDATES).map(([k, v]) => [k, `/${v.source}/${v.flags}`])),
  summary,
  pairedStats: stats,
};
fs.writeFileSync(path.join(OUT_DIR, "e3-results-fuzz.json"), JSON.stringify(out, null, 2));

const pad = (x, n) => String(x).padEnd(n);
console.log(`fuzz n=${N}  oracle-positives=${positives} (${((positives / N) * 100).toFixed(1)}%)`);
console.log(
  pad("candidate", 20) + pad("recall", 10) + pad("precision", 11) + pad("FPR", 10) + pad("FN", 8) + pad("FP", 8) + "acc",
);
for (const n of names) {
  const t = summary[n];
  console.log(
    pad(n, 20) +
      pad(t.recall, 10) +
      pad(t.precision, 11) +
      pad(t.fpr, 10) +
      pad(t.fn, 8) +
      pad(t.fp, 8) +
      (n === "shipped" ? stats.C4_primary.accuracyShipped : stats[n].accuracyCandidate),
  );
}
console.log("\n-- paired vs shipped --");
for (const [n, t] of Object.entries(stats)) {
  console.log(
    `${pad(n, 20)} delta=${pad(t.pointDelta, 10)} bootCI95=${pad(JSON.stringify(t.bootstrapCi95), 22)} McNemar b=${t.mcnemar.b} c=${t.mcnemar.c} chi2=${t.mcnemar.chi2} p=${t.mcnemar.pTwoSidedApprox ?? t.mcnemar.pTwoSided}`,
  );
}
console.log("\n-- FP examples --");
for (const n of names) {
  if (!summary[n].fp) continue;
  console.log(
    `${n} (${summary[n].fp} FP; ${summary[n].fpExplainedByCaseInsensitivity} explained by the inherited /i flag, ${summary[n].fpNotExplainedByCaseInsensitivity} not) causes=${JSON.stringify(summary[n].fpCauses)}`,
  );
  for (const e of summary[n].fpExamples.slice(0, 12)) console.log(`   ${e}`);
}
console.log("\n-- FN examples --");
for (const n of names) {
  if (!summary[n].fn) continue;
  console.log(`${n} (${summary[n].fn} FN):`);
  for (const e of summary[n].fnExamples.slice(0, 12)) console.log(`   ${e}`);
}
console.log(`\nwrote ${path.join(OUT_DIR, "e3-results-fuzz.json")}`);
