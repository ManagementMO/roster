import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire("/Users/mo/Downloads/roster/packages/playbook/src/x.js");
const { parse: parseYaml } = require("yaml");

// 1. Pull the committed test file EXACTLY as of b69f605 (no working-tree trust).
const src = execSync("git show b69f605:packages/playbook/src/playbook.test.ts", {
  cwd: "/Users/mo/Downloads/roster",
  encoding: "utf8",
});
const lines = src.split("\n");

// 2. Locate the BOM regression test and extract the literal passed to parseSkillMd.
const titleIdx = lines.findIndex((l) => l.includes("even behind a UTF-8 BOM"));
const codeLine = lines[titleIdx + 1];
const first = codeLine.indexOf("`");
const last = codeLine.indexOf("`", first + 1);
const rawLiteral = codeLine.slice(first + 1, last); // still has literal \n as backslash-n
// Template-literal semantics: \n -> newline (only escape present here).
const input = rawLiteral.replace(/\\n/g, "\n");

console.log("char[0] of input, code point: U+" + input.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"));
console.log("input starts with real U+FEFF BOM:", input.charCodeAt(0) === 0xfeff);
console.log("");

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// Faithful reproduction of parseSkillMd; the ONLY diff between the two is line 41.
function parseSkillMd(content, slug, dir, { stripBom }) {
  if (stripBom && content.charCodeAt(0) === 0xfeff) content = content.slice(1); // skill.ts:41
  const match = FRONTMATTER.exec(content);
  let frontmatter = {};
  let body = content;
  if (match) {
    body = content.slice(match[0].length);
    try {
      const parsed = parseYaml(match[1] ?? "");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) frontmatter = parsed;
    } catch {
      return null;
    }
  }
  const name =
    typeof frontmatter.name === "string" && frontmatter.name.trim() !== ""
      ? frontmatter.name.trim()
      : slug;
  const description =
    typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
  return { slug, name, description, body: body.trim(), dir, frontmatter };
}

// The test's assertion: toMatchObject({ name, description, body }).
const expected = { name: "pdf-filler", description: "Fill PDF forms", body: "Do the thing." };
const passes = (r) =>
  !!r && r.name === expected.name && r.description === expected.description && r.body === expected.body;

const preFix = parseSkillMd(input, "pdf", "/x", { stripBom: false });
const postFix = parseSkillMd(input, "pdf", "/x", { stripBom: true });

console.log("PRE-FIX  (BOM strip reverted):", JSON.stringify({ name: preFix.name, description: preFix.description, body: preFix.body }));
console.log("  -> test passes on pre-fix code:", passes(preFix));
console.log("");
console.log("POST-FIX (fix present, skill.ts:41):", JSON.stringify({ name: postFix.name, description: postFix.description, body: postFix.body }));
console.log("  -> test passes on fixed code:", passes(postFix));
console.log("");
console.log("=== VERDICT ===");
console.log("Test LOCKS the fix (green->red on revert):", passes(postFix) && !passes(preFix));
