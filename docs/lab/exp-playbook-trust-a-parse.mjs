/**
 * (a) SKILL.md parse robustness — 60 fuzz cases through the REAL parseSkillMd
 * and (end-to-end) scanSkillLibrary on real files. We measure: crash (throw),
 * hang (elapsed), and mis-parse (a realistic VALID skill whose frontmatter is
 * silently dropped, or body corruption). Each case carries an `expect` tag and
 * an assigned severity-if-wrong; the runner records raw observations + a verdict.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseSkillMd, scanSkillLibrary, freshDir, writeSkillRaw, writeResult, hr, msSince, repo } from "./exp-playbook-trust-lib.mjs";

const BOM = "﻿";
const big = (n, ch = "x") => ch.repeat(n);
const FM = (name, desc, body) => `---\nname: ${name}\ndescription: ${desc}\n---\n${body}`;

// Each case: { id, cat, content, expectFM (frontmatter SHOULD parse to name/desc),
//   name (expected name if expectFM), sev (severity if it misbehaves), note }.
const C = [];
const add = (o) => C.push(o);

// --- baseline / graceful-empty ---------------------------------------------
add({ id: "plain-no-fm", cat: "no-frontmatter", content: "Just instructions, no frontmatter.", expectFM: false, note: "name→slug, whole body" });
add({ id: "markdown-no-fm", cat: "no-frontmatter", content: "# Title\n\nSome **markdown** body\n- a\n- b", expectFM: false });
add({ id: "empty-file", cat: "empty", content: "", expectFM: false, note: "indexes empty skill" });
add({ id: "whitespace-only", cat: "empty", content: "   \n\n\t  \n", expectFM: false });
add({ id: "fm-only-no-body", cat: "frontmatter-only", content: "---\nname: only-fm\ndescription: has no body\n---\n", expectFM: true, name: "only-fm" });
add({ id: "fm-only-no-trailing-nl", cat: "frontmatter-only", content: "---\nname: only-fm2\ndescription: d\n---", expectFM: true, name: "only-fm2", note: "closing --- with no trailing newline" });
add({ id: "valid-baseline", cat: "valid", content: FM("tdd-helper", "Drive TDD loops", "Write a failing test first."), expectFM: true, name: "tdd-helper" });
add({ id: "valid-body-whitespace", cat: "valid", content: FM("x", "y", "   \n\n  "), expectFM: true, name: "x", note: "body trims to empty" });

// --- unterminated frontmatter ----------------------------------------------
add({ id: "unterminated-short", cat: "unterminated", content: "---\nname: broken\ndescription: never closes\nstill going", expectFM: false, sev: "medium", note: "open fence, no close → frontmatter SILENTLY becomes body; name→slug, desc lost" });
add({ id: "unterminated-long", cat: "unterminated", content: "---\nname: broken2\n" + big(5000, "content line\n"), expectFM: false, sev: "medium" });

// --- BOM ---------------------------------------------------------------------
add({ id: "bom-valid-fm", cat: "bom", content: BOM + FM("bom-skill", "Real skill saved by a Windows editor", "Body text."), expectFM: true, name: "bom-skill", sev: "high", note: "BOM before --- → regex ^--- fails → frontmatter DROPPED, name→slug, desc empty" });
add({ id: "bom-no-fm", cat: "bom", content: BOM + "plain body no fm", expectFM: false, note: "BOM leaks into body (leading char)" });
add({ id: "bom-crlf-fm", cat: "bom", content: BOM + "---\r\nname: bomcrlf\r\ndescription: d\r\n---\r\nbody", expectFM: true, name: "bomcrlf", sev: "high" });

// --- CRLF / line endings -----------------------------------------------------
add({ id: "crlf-fm", cat: "crlf", content: "---\r\nname: crlf-skill\r\ndescription: windows line endings\r\n---\r\nBody\r\nmore", expectFM: true, name: "crlf-skill", note: "regex allows \\r?\\n — should parse" });
add({ id: "crlf-body-only", cat: "crlf", content: "no fm\r\njust body\r\n", expectFM: false });
add({ id: "mixed-eol", cat: "crlf", content: "---\nname: mixed\r\ndescription: d\n---\r\nbody", expectFM: true, name: "mixed", note: "mixed LF/CRLF in frontmatter" });

// --- large bodies ------------------------------------------------------------
add({ id: "body-2mb", cat: "large", content: FM("big-body", "2MB body", big(2 * 1024 * 1024, "A")), expectFM: true, name: "big-body", note: "perf/hang probe" });
add({ id: "nofm-2mb", cat: "large", content: big(2 * 1024 * 1024, "B"), expectFM: false, note: "2MB body, no fm — regex must fail fast" });
add({ id: "fm-1mb", cat: "large", content: "---\nname: hugefm\ndescription: " + big(1024 * 1024, "d") + "\n---\nbody", expectFM: true, name: "hugefm", note: "1MB description value" });
add({ id: "single-line-1mb", cat: "large", content: big(1024 * 1024, "Z"), expectFM: false, note: "1MB single line no newline" });

// --- unicode / emoji ---------------------------------------------------------
add({ id: "emoji-name", cat: "unicode", content: FM('"🚀 rocket deploy"', "Deploys with a rocket", "body"), expectFM: true, name: "🚀 rocket deploy" });
add({ id: "cjk-name", cat: "unicode", content: FM("部署助手", "中文描述", "正文"), expectFM: true, name: "部署助手" });
add({ id: "rtl-name", cat: "unicode", content: FM('"مساعد النشر"', "وصف", "body"), expectFM: true, name: "مساعد النشر" });
add({ id: "combining-name", cat: "unicode", content: FM('"é́́ combine"', "d", "b"), expectFM: true, note: "combining diacritics preserved" });
add({ id: "emoji-desc-body", cat: "unicode", content: FM("emoji-body", "🎉 party 🎊 desc", "body with 🐛 emoji and 汉字"), expectFM: true, name: "emoji-body" });

// --- code fences / thematic breaks containing --- ---------------------------
add({ id: "fence-with-dashes-after-fm", cat: "fence", content: FM("fenced", "has a code fence", "```sh\n--- not frontmatter ---\ncode\n```\ntail"), expectFM: true, name: "fenced", note: "--- inside body fence must NOT re-trigger" });
add({ id: "starts-with-fence", cat: "fence", content: "```md\n---\nnot: fm\n---\n```\nrest", expectFM: false, note: "starts with ``` so ^--- fails (expected no-fm)" });
add({ id: "thematic-break-eaten", cat: "fence", content: "---\nIntro paragraph before a divider\n---\nActual body after divider", expectFM: false, sev: "medium", note: "top --- ... --- looks like frontmatter; YAML of prose→string→rejected; the Intro line is EATEN from body" });
add({ id: "double-divider-doc", cat: "fence", content: "---\nSection one text\n---\nSection two text\n---\nSection three", expectFM: false, sev: "medium", note: "markdown using --- dividers loses first section" });
add({ id: "fence-dashes-then-real-fm", cat: "fence", content: "---\nname: realfm\ndescription: real\n---\n\n```\n---\n---\n```\n", expectFM: true, name: "realfm" });

// --- YAML anchors / aliases / merge -----------------------------------------
add({ id: "yaml-anchor-alias", cat: "yaml-adv", content: "---\nname: &n anchored\ndescription: *n\n---\nbody", expectFM: true, note: "alias resolves description→'anchored'" });
add({ id: "yaml-merge-key", cat: "yaml-adv", content: "---\nbase: &b\n  name: merged\n  description: from-merge\n<<: *b\n---\nbody", expectFM: false, note: "merge key: name/description are nested under merge — top-level name likely absent → slug" });
add({ id: "yaml-alias-reuse", cat: "yaml-adv", content: "---\nname: reuse\ndescription: d\nlist: [*x]\nx: &x val\n---\nbody", expectFM: false, note: "forward alias before anchor → YAML error → null (dropped)" });
add({ id: "yaml-explicit-null", cat: "yaml-adv", content: "---\nname: null\ndescription: ~\n---\nbody", expectFM: false, note: "name: null → not a string → slug fallback; desc ~ → null" });

// --- tabs vs spaces ----------------------------------------------------------
add({ id: "tab-indent-nested", cat: "tabs", content: "---\nname: tabby\nmeta:\n\tnested: y\n---\nbody", expectFM: false, sev: "medium", note: "TAB indentation is illegal YAML → parse error → skill DROPPED (null)" });
add({ id: "tab-after-colon", cat: "tabs", content: "---\nname:\tspaced\ndescription: d\n---\nbody", expectFM: null, note: "tab after colon — YAML may accept or reject; observe" });
add({ id: "tab-mixed-indent", cat: "tabs", content: "---\nname: mix\nmap:\n  a: 1\n\tb: 2\n---\nbody", expectFM: false, sev: "medium", note: "mixed space/tab indent → error → dropped" });

// --- wrong-typed frontmatter fields -----------------------------------------
add({ id: "name-is-list", cat: "typed", content: "---\nname:\n  - a\n  - b\ndescription: d\n---\nbody", expectFM: false, note: "name is array → slug fallback; desc ok" });
add({ id: "name-is-number", cat: "typed", content: "---\nname: 123\ndescription: numeric name\n---\nbody", expectFM: false, note: "name number → slug fallback" });
add({ id: "name-is-bool", cat: "typed", content: "---\nname: true\ndescription: d\n---\nbody", expectFM: false, note: "name bool → slug fallback" });
add({ id: "fm-top-level-list", cat: "typed", content: "---\n- a\n- b\n---\nbody", expectFM: false, note: "top-level YAML array → rejected (isArray) → {}; body kept" });
add({ id: "fm-top-level-scalar", cat: "typed", content: "---\njust a string scalar\n---\nbody", expectFM: false, note: "scalar → rejected → {}" });
add({ id: "fm-empty-block", cat: "typed", content: "---\n---\nbody", expectFM: false, note: "empty frontmatter → null → {}" });
add({ id: "fm-comment-only", cat: "typed", content: "---\n# only a comment\n---\nbody", expectFM: false, note: "comment-only → null → {}" });
add({ id: "fm-dup-keys", cat: "typed", content: "---\nname: first\nname: second\ndescription: d\n---\nbody", expectFM: null, note: "duplicate name key — YAML error or last-wins; observe" });

// --- block scalars -----------------------------------------------------------
add({ id: "desc-block-literal", cat: "block", content: "---\nname: blocklit\ndescription: |\n  line one\n  line two\n---\nbody", expectFM: true, name: "blocklit", note: "literal block scalar description" });
add({ id: "desc-block-folded", cat: "block", content: "---\nname: blockfold\ndescription: >\n  folded line one\n  folded line two\n---\nbody", expectFM: true, name: "blockfold" });

// --- pathological structure --------------------------------------------------
add({ id: "deep-nesting", cat: "patho", content: "---\nname: deep\ndescription: d\ntree: " + "[".repeat(2000) + "]".repeat(2000) + "\n---\nbody", expectFM: null, sev: "high", note: "2000-deep nested seq — crash/hang probe" });
add({ id: "many-keys", cat: "patho", content: "---\nname: manykeys\ndescription: d\n" + Array.from({ length: 10000 }, (_, i) => `k${i}: ${i}`).join("\n") + "\n---\nbody", expectFM: true, name: "manykeys", note: "10k keys — perf probe" });
add({ id: "name-100k", cat: "patho", content: "---\nname: " + big(100000, "N") + "\ndescription: d\n---\nbody", expectFM: true, note: "100k-char name — preserved?" });
add({ id: "nul-byte", cat: "patho", content: "---\nname: nul\x00byte\ndescription: d\n---\nbody\x00tail", expectFM: null, note: "NUL bytes — no crash" });
add({ id: "lone-surrogate", cat: "patho", content: "---\nname: sur\uD800rogate\ndescription: d\n---\nbody", expectFM: null, note: "lone surrogate — no crash" });
add({ id: "control-chars-body", cat: "patho", content: FM("ctrl", "d", "body\x01\x02\x03\x07 with controls"), expectFM: true, name: "ctrl" });

// --- fence-delimiter edge shapes --------------------------------------------
add({ id: "leading-space-fence", cat: "delim", content: " ---\nname: leadspace\ndescription: d\n---\nbody", expectFM: false, sev: "medium", note: "one leading space before --- → ^--- fails → frontmatter DROPPED" });
add({ id: "trailing-space-fence", cat: "delim", content: "--- \nname: trailspace\ndescription: d\n---\nbody", expectFM: false, sev: "medium", note: "trailing space on open fence → ^---\\r?\\n fails → DROPPED" });
add({ id: "four-dash-open", cat: "delim", content: "----\nname: fourdash\ndescription: d\n----\nbody", expectFM: false, sev: "low", note: "4-dash fence → ^--- then needs \\n but sees '-' → DROPPED" });
add({ id: "extra-dash-close", cat: "delim", content: "---\nname: extraclose\ndescription: d\n----\nbody", expectFM: true, name: "extraclose", note: "close ---- : \\n--- matches, leaves '-' leaking to body" });
add({ id: "blank-line-first", cat: "delim", content: "\n---\nname: blankfirst\ndescription: d\n---\nbody", expectFM: false, sev: "medium", note: "blank line before frontmatter → ^--- fails → DROPPED" });
add({ id: "closing-only", cat: "delim", content: "name: x\ndescription: y\n---\nbody", expectFM: false, note: "no opening fence → whole thing body (expected)" });
add({ id: "crlf-unterminated", cat: "delim", content: "---\r\nname: crlfbroken\r\ndescription: d\r\nno close", expectFM: false, sev: "medium", note: "CRLF unterminated → DROPPED to body" });

// pad to >= 60
add({ id: "valid-with-extra-fields", cat: "valid", content: "---\nname: extra\ndescription: d\nlicense: MIT\nallowed-tools: [Read, Write]\n---\nbody", expectFM: true, name: "extra", note: "forward-compat fields ignored, name/desc parsed" });
add({ id: "desc-missing", cat: "valid", content: "---\nname: nodesc\n---\nbody", expectFM: true, name: "nodesc", note: "description missing → '' (by design, flagged empty)" });

const results = [];
let threw = 0, hung = 0, misparse = 0, dropped = 0;
const HANG_MS = 3000;

for (const c of C) {
  const t0 = hr();
  let res, error = null, ms = 0;
  try {
    res = parseSkillMd(c.content, c.id, `/virt/${c.id}`);
    ms = msSince(t0);
  } catch (e) {
    ms = msSince(t0);
    error = String(e && e.message ? e.message : e);
  }
  const isNull = res === null;
  const name = isNull ? null : res.name;
  const descLen = isNull ? null : res.description.length;
  const bodyLen = isNull ? null : res.body.length;
  const fmKeys = isNull || !res.frontmatter ? [] : Object.keys(res.frontmatter);
  const nameIsSlug = name === c.id;

  // verdict
  let verdict = "ok";
  if (error) { verdict = "CRASH"; threw++; }
  else if (ms > HANG_MS) { verdict = "HANG"; hung++; }
  else if (c.expectFM === true) {
    // a realistic valid skill: frontmatter MUST have parsed to name/desc
    if (isNull) { verdict = "misparse-dropped"; misparse++; }
    else if (nameIsSlug && (c.name && c.name !== c.id)) { verdict = "misparse-frontmatter-dropped"; misparse++; }
    else if (c.name && name !== c.name) { verdict = "misparse-name-wrong"; misparse++; }
    else verdict = "ok-parsed";
  } else if (c.expectFM === false) {
    if (isNull) { verdict = "dropped"; dropped++; }
    else verdict = "ok-fallback";
  } else {
    // expectFM null → observational only
    verdict = isNull ? "observed-null" : "observed-parsed";
  }

  results.push({
    id: c.id, cat: c.cat, sev: c.sev ?? "info", bytes: Buffer.byteLength(c.content),
    ms: +ms.toFixed(2), error, isNull, name: typeof name === "string" ? name.slice(0, 60) : name,
    nameIsSlug, descLen, bodyLen, fmKeys: fmKeys.slice(0, 6), verdict, note: c.note ?? "",
  });
}

// End-to-end on-disk confirmation for the highest-signal cases: does the real
// scanSkillLibrary reproduce the same (mis)parse when the bytes are on disk?
const lib = freshDir("parse-e2e");
const e2ePick = ["bom-valid-fm", "crlf-fm", "unterminated-short", "tab-indent-nested", "thematic-break-eaten", "leading-space-fence", "valid-baseline", "emoji-name"];
const e2e = [];
for (const id of e2ePick) {
  const c = C.find((x) => x.id === id);
  writeSkillRaw(lib, id, c.content);
}
const scanned = scanSkillLibrary(lib);
const byslug = new Map(scanned.map((s) => [s.slug, s]));
for (const id of e2ePick) {
  const s = byslug.get(id);
  e2e.push({
    id,
    indexed: !!s,
    name: s ? s.name : null,
    nameIsSlug: s ? s.name === id : null,
    descLen: s ? s.description.length : null,
    bodyBytes: s ? Buffer.byteLength(s.body) : null,
  });
}

// Dedicated hang guard: a YAML billion-laughs bomb, run in an ISOLATED child
// process with a hard 10s kill so a real ReDoS/expansion can't wedge this run.
const bombFile = path.join(lib, "_bomb.mjs");
const bomb =
  "a: &a [x,x,x,x,x,x,x,x,x,x]\n" +
  "b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\n" +
  "c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\n" +
  "d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]\n" +
  "e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]\n" +
  "f: &f [*e,*e,*e,*e,*e,*e,*e,*e,*e,*e]\n" +
  "g: &g [*f,*f,*f,*f,*f,*f,*f,*f,*f,*f]\n" +
  "name: bomb\n";
fs.writeFileSync(bombFile, `
import { createRequire } from "node:module";
import path from "node:path";
const req = createRequire(${JSON.stringify(path.join(repo, "packages/cli/package.json"))});
const { parseSkillMd } = await import(req.resolve("@rosterhq/playbook"));
const content = ${JSON.stringify("---\n" + bomb + "---\nbody")};
const t = Date.now();
let r, err = null;
try { r = parseSkillMd(content, "bomb", "/x"); } catch (e) { err = String(e && e.message || e); }
process.stdout.write(JSON.stringify({ ms: Date.now() - t, isNull: r === null, err, name: r && r.name }));
`);
const t0bomb = hr();
const child = spawnSync(process.execPath, [bombFile], { timeout: 10000, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const bombMs = msSince(t0bomb);
let bombResult;
if (child.error && child.error.code === "ETIMEDOUT") {
  bombResult = { verdict: "HANG", killedAfterMs: +bombMs.toFixed(0), note: "YAML anchor-expansion bomb wedged the parser >10s" };
} else if (child.status !== 0) {
  bombResult = { verdict: "child-nonzero", status: child.status, signal: child.signal, stderr: (child.stderr || "").slice(0, 400), wallMs: +bombMs.toFixed(0) };
} else {
  let parsed = null; try { parsed = JSON.parse(child.stdout); } catch {}
  bombResult = { verdict: "returned", wallMs: +bombMs.toFixed(0), ...(parsed || { rawStdout: child.stdout.slice(0, 200) }) };
}

const summary = {
  totalCases: C.length,
  crashes: threw,
  hangs: hung,
  misparses: misparse,
  dropped,
  hangThresholdMs: HANG_MS,
  slowestMs: Math.max(...results.map((r) => r.ms)),
  misparseCases: results.filter((r) => r.verdict.startsWith("misparse")).map((r) => ({ id: r.id, cat: r.cat, sev: r.sev, verdict: r.verdict, note: r.note })),
  droppedCases: results.filter((r) => r.verdict === "dropped").map((r) => ({ id: r.id, cat: r.cat, sev: r.sev, note: r.note })),
  yamlBomb: bombResult,
};

const out = { generatedAt: new Date().toISOString(), summary, e2e, cases: results };
const p = writeResult("a-parse", out);
fs.rmSync(path.join(repo, "docs/lab/tmp-playbook-trust/parse-e2e"), { recursive: true, force: true });
console.log(`[a-parse] cases=${C.length} crashes=${threw} hangs=${hung} misparses=${misparse} dropped=${dropped} slowest=${summary.slowestMs.toFixed(1)}ms`);
console.log(`[a-parse] misparse ids: ${summary.misparseCases.map((m) => m.id).join(", ")}`);
console.log(`[a-parse] yamlBomb: ${JSON.stringify(bombResult)}`);
console.log(`[a-parse] → ${p}`);
