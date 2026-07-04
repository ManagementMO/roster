/**
 * Shared harness for the playbook-trust experiments (slug: playbook-trust).
 * Imports the REAL built @rosterhq/playbook + @rosterhq/shared dist exactly like
 * docs/verification/dense-live.mjs. No mocks: real files on disk, real parser,
 * real trust scanner, real openclaw accounting, real token estimator.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const LAB = path.join(repo, "docs", "lab");
export const SCRATCH = path.join(LAB, "tmp-playbook-trust");

const req = createRequire(path.join(repo, "packages/cli/package.json"));
export const playbook = await import(req.resolve("@rosterhq/playbook"));
export const shared = await import(req.resolve("@rosterhq/shared"));

export const {
  parseSkillMd,
  isScriptPath,
  scanSkillLibrary,
  scanSkillSources,
  trustScan,
  openclawInjectionChars,
  skillToCapabilityEntry,
  skillInvocationResult,
} = playbook;
export const { estimateTokensFromChars, estimateTokens } = shared;

/** Fresh empty scratch subdir; caller owns cleanup via cleanup(). */
export function freshDir(tag) {
  const dir = path.join(SCRATCH, tag);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a real SKILL.md skill dir on disk. content is the RAW SKILL.md bytes. */
export function writeSkillRaw(libDir, slug, content, files = {}) {
  const dir = path.join(libDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), content);
  for (const [rel, data] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
  }
  return dir;
}

export function writeResult(name, obj) {
  const p = path.join(LAB, `results-playbook-trust-${name}.json`);
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
  return p;
}

export const hr = () => Number(process.hrtime.bigint());
export const msSince = (t0) => (hr() - t0) / 1e6;
