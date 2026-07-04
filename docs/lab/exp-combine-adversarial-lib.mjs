// Shared helpers for the combine-adversarial experiments.
// Imports the REAL built @rosterhq/combine exactly like docs/verification/dense-live.mjs.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(repo, "packages/cli/package.json"));

export const combine = await import(require.resolve("@rosterhq/combine"));
export const { parseSuite, runSuite, buildLabResults, template } = combine;

export const SUITE_PATH = path.join(repo, "suites/filesystem/tasks.yaml");
export const SUITE_YAML = fs.readFileSync(SUITE_PATH, "utf8");

// The REAL server-under-test: official filesystem server via npx, rooted per-task
// at {{sandbox}} (runner templates server args per task).
export const REAL_FS_SERVER = {
  name: "filesystem",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "{{sandbox}}"],
};

export const TMP = path.join(repo, "docs/lab/tmp-combine-adversarial");
export function ensureTmp() {
  fs.mkdirSync(TMP, { recursive: true });
  return TMP;
}

// Strip the fields that are ALLOWED to vary across runs (wall-clock only).
export function stripVolatile(labRun) {
  return labRun.results.map((r) => {
    const { latencyMs, ...stable } = r;
    return stable;
  });
}

export function nowTag() {
  return new Date().toISOString();
}
