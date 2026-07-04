#!/usr/bin/env node
/**
 * Experiment (d) worker — hammers saveConfig() from @rosterhq/cli against the
 * SAME roster.json as three sibling processes (ROSTER_TEST_HOME isolated).
 * argv[2] = JSON {home, writerId, writes, goFile}.
 * Emits one JSON line: per-error-code counts from real saveConfig calls.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cfg = JSON.parse(process.argv[2]);
process.env.ROSTER_TEST_HOME = cfg.home; // must be set before paths.js is used
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { saveConfig, defaultConfig } = await import(req.resolve("@rosterhq/cli"));

while (!fs.existsSync(cfg.goFile)) await new Promise((r) => setTimeout(r, 5));

const errors = [];
let ok = 0;
const wall0 = Date.now();
for (let i = 0; i < cfg.writes; i++) {
  // Realistic-size payload (~6KB): 40 servers like a busy roster.json.
  const config = defaultConfig();
  for (let s = 0; s < 40; s++) {
    config.servers[`srv-${s}`] = {
      command: "npx",
      args: ["-y", `@example/server-${s}`, `--writer=${cfg.writerId}`, `--seq=${i}`],
      env: { TOKEN: `t-${cfg.writerId}-${i}-${"x".repeat(40)}` },
      importedFrom: ["claude-code"],
    };
  }
  try {
    saveConfig(config);
    ok += 1;
  } catch (err) {
    errors.push({ i, code: err.code ?? "NO_CODE", message: String(err.message).slice(0, 160) });
  }
}

const errorCounts = {};
for (const e of errors) errorCounts[e.code] = (errorCounts[e.code] ?? 0) + 1;
process.stdout.write(
  JSON.stringify({
    writerId: cfg.writerId,
    ok,
    failed: errors.length,
    errorCounts,
    errorSample: errors.slice(0, 8),
    wallMs: Date.now() - wall0,
  }) + "\n",
);
