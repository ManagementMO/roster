/**
 * (d) Symlinked skill dir: confirm the scan's skip is silent-and-safe, not a
 * crash or an infinite loop. scanSkillLibrary iterates readdirSync(withFileTypes)
 * and skips non-directories via entry.isDirectory() (symlinks report false).
 * We build, on a REAL filesystem: a symlinked skill dir, a symlink pointing at a
 * real skill, a symlinked SKILL.md inside a real dir, a self-referential symlink
 * loop in a skill's resource tree, and a dangling symlink — then scan and assert
 * no throw / no hang, and report exactly what indexed.
 */
import fs from "node:fs";
import path from "node:path";
import { scanSkillLibrary, freshDir, writeSkillRaw, writeResult, hr, msSince, repo } from "./exp-playbook-trust-lib.mjs";

const mk = (name, desc, body) => `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}\n`;

const lib = freshDir("symlink");
const outside = freshDir("symlink-target"); // a real skill dir OUTSIDE the library

// 1) a normal real skill in the library (control)
writeSkillRaw(lib, "real-skill", mk("real-skill", "a normal skill", "body"));

// 2) a real skill dir OUTSIDE, then symlink it INTO the library as a child dir
const targetSkillDir = writeSkillRaw(outside, "linked-skill", mk("linked-skill", "lives outside, linked in", "body"));
const notes = [];
const trySymlink = (fn, label) => { try { fn(); notes.push(`created: ${label}`); } catch (e) { notes.push(`symlink-unsupported(${label}): ${e.code || e.message}`); } };

trySymlink(() => fs.symlinkSync(targetSkillDir, path.join(lib, "symlinked-dir"), "dir"), "symlinked-dir → external skill dir");

// 3) a real dir in the library whose SKILL.md is itself a symlink to an external SKILL.md
const realDirSymMd = path.join(lib, "real-dir-symlinked-md");
fs.mkdirSync(realDirSymMd, { recursive: true });
trySymlink(() => fs.symlinkSync(path.join(targetSkillDir, "SKILL.md"), path.join(realDirSymMd, "SKILL.md"), "file"), "real dir with symlinked SKILL.md");

// 4) a real skill whose resource tree contains a self-referential symlink loop
const loopSkill = writeSkillRaw(lib, "loop-skill", mk("loop-skill", "has a resource loop", "body"), { "refs/keep.md": "x" });
trySymlink(() => fs.symlinkSync(loopSkill, path.join(loopSkill, "refs", "self"), "dir"), "self-referential loop in resources/");

// 5) a dangling symlink child (points nowhere)
trySymlink(() => fs.symlinkSync(path.join(outside, "does-not-exist"), path.join(lib, "dangling"), "dir"), "dangling symlink child");

// scan under a hard wall-clock guard (an infinite loop would blow past this)
const t0 = hr();
let scanned = null, error = null;
try {
  scanned = scanSkillLibrary(lib);
} catch (e) {
  error = String(e && e.stack ? e.stack : e);
}
const ms = msSince(t0);

const indexedSlugs = scanned ? scanned.map((s) => s.slug).sort() : null;
const loop = scanned ? scanned.find((s) => s.slug === "loop-skill") : null;

const summary = {
  setup: notes,
  threw: !!error,
  error,
  scanMs: +ms.toFixed(2),
  hang: ms > 3000,
  indexedSlugs,
  indexedCount: indexedSlugs ? indexedSlugs.length : null,
  symlinkedDirSkipped: indexedSlugs ? !indexedSlugs.includes("symlinked-dir") : null,
  danglingSkipped: indexedSlugs ? !indexedSlugs.includes("dangling") : null,
  realDirWithSymlinkedMdIndexed: indexedSlugs ? indexedSlugs.includes("real-dir-symlinked-md") : null,
  loopSkillResources: loop ? loop.resources : null,
  loopSkillDidNotRecurseIntoSymlink: loop ? !loop.resources.some((r) => r.includes("self/")) : null,
  verdict: !error && ms < 3000 ? "silent-and-safe (no throw, no hang)" : (error ? "CRASH" : "HANG"),
};

const out = { generatedAt: new Date().toISOString(), summary };
const p = writeResult("d-symlink", out);
fs.rmSync(path.join(repo, "docs/lab/tmp-playbook-trust/symlink"), { recursive: true, force: true });
fs.rmSync(path.join(repo, "docs/lab/tmp-playbook-trust/symlink-target"), { recursive: true, force: true });
console.log(`[d-symlink] threw=${!!error} scanMs=${ms.toFixed(1)} indexed=${JSON.stringify(indexedSlugs)}`);
console.log(`[d-symlink] symlinkedDirSkipped=${summary.symlinkedDirSkipped} realDirWithSymlinkedMdIndexed=${summary.realDirWithSymlinkedMdIndexed} loopNoRecurse=${summary.loopSkillDidNotRecurseIntoSymlink}`);
console.log(`[d-symlink] verdict=${summary.verdict}`);
console.log(`[d-symlink] setup: ${notes.join(" | ")}`);
console.log(`[d-symlink] → ${p}`);
