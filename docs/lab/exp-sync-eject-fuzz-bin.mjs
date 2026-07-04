/**
 * EXP A2 — the REAL CLI path: does one malformed/BOM'd client config abort
 * `roster sync` for the remaining clients? Runs dist/bin.js as a subprocess
 * against a fixture home with ALL FOUR write-client configs present, where
 * claude-code's config carries a UTF-8 BOM (first in WRITE_CLIENTS order).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { repo, SCRATCH, configPathFor, saveSection } from "./exp-sync-eject-fuzz-lib.mjs";

const BIN = path.join(repo, "packages/cli/dist/bin.js");
const home = path.join(SCRATCH, "bin-bom-abort");
fs.rmSync(home, { recursive: true, force: true });
fs.mkdirSync(home, { recursive: true });

const goodJson = `{\n  "mcpServers": {\n    "fs": {"command": "npx", "args": ["-y", "srv"]}\n  }\n}\n`;
const configs = {
  "claude-code": "﻿" + goodJson, // BOM — JSON.parse rejects
  "cursor": goodJson,
  "codex": `[mcp_servers.fs]\ncommand = "npx"\n`,
  "openclaw": goodJson,
};
const paths = {};
for (const [id, content] of Object.entries(configs)) {
  const p = configPathFor(id, home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  paths[id] = p;
}

function run(args) {
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], {
      env: { ...process.env, ROSTER_TEST_HOME: home },
      cwd: home, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
}

const syncRun = run(["sync"]);
console.log(`roster sync exit=${syncRun.code}\n---\n${syncRun.out}---`);
const state = {};
for (const [id, p] of Object.entries(paths)) {
  const now = fs.readFileSync(p, "utf8");
  state[id] = {
    changed: now !== configs[id],
    backupExists: fs.existsSync(path.join(home, ".roster", "backups", id)),
  };
}
console.log("post-sync state:", JSON.stringify(state, null, 2));

// Also: same but the BOM only on codex (3rd in order) — do the first two sync, later ones abort?
const home2 = path.join(SCRATCH, "bin-bom-abort-2");
fs.rmSync(home2, { recursive: true, force: true });
fs.mkdirSync(home2, { recursive: true });
const configs2 = { ...configs, "claude-code": goodJson, "codex": "﻿" + `[mcp_servers.fs]\ncommand = "npx"\n` };
const paths2 = {};
for (const [id, content] of Object.entries(configs2)) {
  const p = configPathFor(id, home2);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  paths2[id] = p;
}
const run2 = (() => {
  try {
    const out = execFileSync(process.execPath, [BIN, "sync"], {
      env: { ...process.env, ROSTER_TEST_HOME: home2 }, cwd: home2, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: (e.stdout || "") + (e.stderr || "") }; }
})();
console.log(`\nBOM-on-codex(3rd): roster sync exit=${run2.code}\n---\n${run2.out}---`);
const state2 = {};
for (const [id, p] of Object.entries(paths2)) {
  state2[id] = { changed: fs.readFileSync(p, "utf8") !== configs2[id], backupExists: fs.existsSync(path.join(home2, ".roster", "backups", id)) };
}
console.log("post-sync state2:", JSON.stringify(state2, null, 2));

// TOML BOM check: does smol-toml accept a BOM?
saveSection("bin", { bomFirst: { exit: syncRun.code, out: syncRun.out, state }, bomThird: { exit: run2.code, out: run2.out, state: state2 } });
