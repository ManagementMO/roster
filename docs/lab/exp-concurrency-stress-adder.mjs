#!/usr/bin/env node
/**
 * Experiment (d3) worker — one real `roster`-style read-modify-write:
 * loadConfig() → mergeServers(one new server) → saveConfig(), exactly the
 * sequence `roster init/add` performs. Two of these race per round.
 * argv[2] = JSON {home, serverName, goFile}.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cfg = JSON.parse(process.argv[2]);
process.env.ROSTER_TEST_HOME = cfg.home;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { loadConfig, mergeServers, saveConfig } = await import(req.resolve("@rosterhq/cli"));

while (!fs.existsSync(cfg.goFile)) await new Promise((r) => setTimeout(r, 2));

let outcome = "ok";
let message = null;
try {
  const config = loadConfig();
  const { config: merged } = mergeServers(config, [
    {
      name: cfg.serverName,
      command: "npx",
      args: ["-y", `@example/${cfg.serverName}`],
      client: "claude-code",
      sourcePath: "/dev/null",
    },
  ]);
  saveConfig(merged);
} catch (err) {
  outcome = err.code ?? "ERROR";
  message = String(err.message).slice(0, 160);
}
process.stdout.write(JSON.stringify({ serverName: cfg.serverName, outcome, message }) + "\n");
