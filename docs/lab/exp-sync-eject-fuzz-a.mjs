/**
 * EXP A — byte-for-byte eject across client config formats.
 * 100 valid-but-weird configs: 26 JSON/JSONC variants x 3 JSON write clients
 * (claude-code, cursor, openclaw) + 22 TOML variants for codex = 100 cases,
 * each run through the REAL syncClient -> ejectClient on real files under a
 * fresh ROSTER_TEST_HOME. Byte-compare (raw Buffer) post-eject vs original.
 * Plus: 6 probes of the exported syncClient on NON-write clients (bin.ts
 * guards these today; the export does not).
 */
import fs from "node:fs";
import path from "node:path";
import {
  syncClient, ejectClient, configPathFor, freshHome, writeConfig,
  firstDiff, listBackupDirs, backupsRoot, saveSection, SCRATCH,
} from "./exp-sync-eject-fuzz-lib.mjs";

process.chdir(SCRATCH); // neutral cwd so cwd-relative config candidates never fire

// ---------- 26 JSON/JSONC variants (exact bytes) ----------
const SRV = (cmd, extra = "") => `{"command":"${cmd}","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"]${extra}}`;
const big = (n, ch = "x") => ch.repeat(n);

export const JSON_VARIANTS = [
  ["minimal-empty-object", `{}`],
  ["empty-mcpServers", `{"mcpServers": {}}\n`],
  ["null-mcpServers", `{"mcpServers": null}\n`],
  ["array-mcpServers", `{"mcpServers": [${SRV("npx")}]}\n`],
  ["unicode-heavy", `{\n  "mcpServers": {\n    "файл-сервер": ${SRV("npx")},\n    "🚀🔧": {"command": "npx", "env": {"KEY_中文": "值\\u200d👨‍👩‍👧", "עברית": "café\\u0301"}},\n    "a\\u0000b": {"command": "npx"}\n  },\n  "note": " señor naïve — ﷺ ｱｲｳ"\n}\n`],
  ["deep-env-objects", `{"mcpServers":{"deep":{"command":"npx","env":{"L1":{"L2":{"L3":{"L4":{"L5":{"L6":{"L7":{"L8":"bottom"}}}}}}},"OK":"flat"}}}}\n`],
  ["one-megabyte", null], // built below
  ["extra-top-keys", null],
  ["mixed-indentation", `{\n\t"mcpServers": {\n   "a": ${SRV("npx")},\n\t\t\t"b": ${SRV("node")}\n       },\n\t"theme":\t"dark"\n}\n`],
  ["no-trailing-newline", `{\n  "mcpServers": {\n    "fs": ${SRV("npx")}\n  }\n}`],
  ["crlf-endings", `{\r\n  "mcpServers": {\r\n    "fs": ${SRV("npx")}\r\n  },\r\n  "os": "windows"\r\n}\r\n`],
  ["cr-only-endings", `{\r  "mcpServers": {\r    "fs": ${SRV("npx")}\r  }\r}\r`],
  ["jsonc-comments", `{\n  // my servers\n  "mcpServers": {\n    /* filesystem */\n    "fs": ${SRV("npx")}\n  }\n  // end\n}\n`],
  ["jsonc-trailing-commas", `{\n  "mcpServers": {\n    "fs": ${SRV("npx")},\n  },\n}\n`],
  ["utf8-bom", `﻿{\n  "mcpServers": {\n    "fs": ${SRV("npx")}\n  }\n}\n`],
  ["duplicate-keys", `{"mcpServers":{"fs":${SRV("npx")}},"mcpServers":{"fs2":${SRV("node")}}}\n`],
  ["lone-surrogate-escape", `{"mcpServers":{"s":{"command":"npx","env":{"BAD":"\\ud800alone"}}},"x":"\\udfff"}\n`],
  ["huge-numbers", `{"mcpServers":{"fs":${SRV("npx")}},"stats":{"a":1e999,"b":-0,"c":9007199254740993,"d":0.1,"e":1E+2}}\n`],
  ["nul-and-controls", `{"mcpServers":{"s":{"command":"npx","env":{"CTL":"\\u0000\\u0001\\u001f\\b\\f"}}}}\n`],
  ["single-line-dense", `{"mcpServers":{"a":${SRV("npx")},"b":${SRV("node")},"c":${SRV("deno")}},"k1":1,"k2":[1,2,3],"k3":{"n":true}}`],
  ["windows-paths", `{"mcpServers":{"fs":{"command":"C:\\\\Program Files\\\\nodejs\\\\npx.exe","args":["D:\\\\data\\\\srv"],"env":{"P":"C:\\\\Users\\\\mo\\\\AppData"}}}}\n`],
  ["already-roster-only", `{\n  "mcpServers": {\n    "roster": {\n      "command": "roster",\n      "args": ["serve"]\n    }\n  }\n}\n`],
  ["roster-plus-extra", `{"mcpServers":{"roster":{"command":"roster","args":["serve"]},"mine":${SRV("npx")}}}\n`],
  ["scalar-top-level", `42\n`],
  ["array-top-level", `[]`],
  ["url-and-odd-servers", `{"mcpServers":{"remote":{"url":"https://mcp.example.com/sse"},"http2":{"httpUrl":"https://x.dev/mcp"},"empty":{},"numcmd":{"command":42},"good":${SRV("npx")}}}\n`],
];
// build the two null placeholders
{
  const servers = {};
  for (let i = 0; i < 400; i++) servers[`srv-${i}`] = { command: "npx", args: ["-y", `pkg-${i}`], env: { TOKEN: big(2000, String.fromCharCode(97 + (i % 26))) } };
  const oneMb = JSON.stringify({ mcpServers: { fs: JSON.parse(SRV("npx")) }, bigBlob: servers }, null, 2) + "\n";
  JSON_VARIANTS[6][1] = oneMb; // ~1MB
  const extra = { theme: "dark", numTimesOpened: 421, projects: {}, tipsHistory: { "memory-command": 4 }, cachedGrants: [1, 2, 3], deep: {} };
  let d = extra.deep;
  for (let i = 0; i < 20; i++) { d.next = { level: i, arr: [i, [i]] }; d = d.next; }
  for (let i = 0; i < 25; i++) extra[`unknownKey${i}`] = `v${i}`;
  extra.mcpServers = { fs: JSON.parse(SRV("npx")) };
  JSON_VARIANTS[7][1] = JSON.stringify(extra, null, 2) + "\n";
}

// ---------- 22 TOML variants for codex ----------
export const TOML_VARIANTS = [
  ["toml-empty-file", ``],
  ["toml-empty-mcp-table", `[mcp_servers]\n`],
  ["toml-comments", `# codex config\nmodel = "o4" # inline comment\n\n[mcp_servers.fs]\ncommand = "npx"\nargs = ["-y", "server-fs"]\n# trailing comment\n`],
  ["toml-datetimes", `created = 2026-01-02T03:04:05.123Z\nlocal_date = 2026-07-04\nlocal_time = 07:32:00\n\n[mcp_servers.fs]\ncommand = "npx"\n`],
  ["toml-multiline-basic", `banner = """\nline one\nline two \\"quoted\\"\n"""\n\n[mcp_servers.fs]\ncommand = "npx"\n`],
  ["toml-literal-strings", `regex = '<\\i\\c*\\s*>'\npath = 'C:\\Users\\mo'\n\n[mcp_servers.fs]\ncommand = "npx"\n`],
  ["toml-inline-tables", `point = { x = 1, y = 2 }\nmcp_servers = { fs = { command = "npx", args = ["-y", "srv"] } }\n`],
  ["toml-dotted-keys", `a.b.c = 1\nsite."google.com" = true\n\n[mcp_servers.fs]\ncommand = "npx"\nenv.PATH_EXTRA = "/opt/bin"\n`],
  ["toml-array-of-tables", `[[profiles]]\nname = "one"\n\n[[profiles]]\nname = "two"\n\n[mcp_servers.fs]\ncommand = "npx"\n`],
  ["toml-unicode", `motto = "日本語テスト émojis 🚀"\n\n[mcp_servers."сервер-1"]\ncommand = "npx"\nenv = { "ключ" = "значение" }\n`],
  ["toml-crlf", `model = "o4"\r\n\r\n[mcp_servers.fs]\r\ncommand = "npx"\r\nargs = ["-y", "srv"]\r\n`],
  ["toml-no-trailing-newline", `[mcp_servers.fs]\ncommand = "npx"`],
  ["toml-mixed-indent", `[mcp_servers.fs]\n\tcommand = "npx"\n   args    =    ["-y",    "srv"]\n`],
  ["toml-one-megabyte", null],
  ["toml-exotic-numbers", `pos_inf = inf\nneg_inf = -inf\nnot_num = nan\nhexv = 0xDEADBEEF\noct = 0o755\nbin = 0b1101\nbig = 1_000_000\nfloat_us = 9_224.617\n\n[mcp_servers.fs]\ncommand = "npx"\n`],
  ["toml-already-roster-only", `[mcp_servers.roster]\ncommand = "roster"\nargs = ["serve"]\n`],
  ["toml-roster-plus-extra", `[mcp_servers.roster]\ncommand = "roster"\nargs = ["serve"]\n\n[mcp_servers.mine]\ncommand = "npx"\n`],
  ["toml-env-tables", `[mcp_servers.api]\ncommand = "npx"\n\n[mcp_servers.api.env]\nAPI_KEY = "sk-123"\nEMPTY = ""\nSPACES = "  padded  "\n`],
  ["toml-deep-tables", `[a.b.c.d.e.f.g]\nleaf = true\n\n[mcp_servers.fs]\ncommand = "npx"\n`],
  ["toml-trailing-comment-no-newline", `[mcp_servers.fs]\ncommand = "npx" # the end`],
  ["toml-crlf-in-multiline", `note = """\r\nwindows\r\nlines\r\n"""\n\n[mcp_servers.fs]\ncommand = "npx"\n`],
  ["toml-aligned-equals", `[mcp_servers.fs]\ncommand      = "npx"\nargs         = ["-y", "srv"]\n\n[mcp_servers.zz]\ncommand = "node"\n`],
];
{
  let lines = [`# big config\n`];
  for (let i = 0; i < 900; i++) lines.push(`[mcp_servers.srv-${i}]\ncommand = "npx"\nargs = ["-y", "pkg-${i}"]\nenv = { TOKEN = "${big(1000)}" }\n\n`);
  TOML_VARIANTS[13][1] = lines.join("");
}

// ---------- runner ----------
function runCase(clientId, variantName, content) {
  const home = freshHome(`a-${clientId}-${variantName}`.slice(0, 80));
  const original = Buffer.from(content, "utf8");
  const cfgPath = writeConfig(clientId, home, original);

  const rec = { client: clientId, variant: variantName, bytes: original.length };
  let syncRes = null;
  try {
    syncRes = syncClient(clientId);
    rec.sync = syncRes.action;
    rec.imported = syncRes.imported ?? 0;
  } catch (err) {
    rec.sync = "THREW";
    rec.syncError = String(err && err.message || err).slice(0, 200);
  }

  // config state after sync
  const afterSync = fs.readFileSync(cfgPath);
  rec.configChangedBySync = !afterSync.equals(original);
  rec.backupDirs = listBackupDirs(home, clientId).length;
  if (rec.sync === "synced") {
    // written config must be parseable by the client's own parser
    try {
      const spec = (await0().find((c) => c.id === clientId));
      const parsedServers = spec.parse(afterSync.toString("utf8"), cfgPath);
      rec.writtenParses = true;
      rec.writtenPointsAtRoster = parsedServers.some((s) => s.name === "roster" && s.command === "roster");
    } catch (e) {
      rec.writtenParses = false;
      rec.writtenParseError = String(e && e.message || e).slice(0, 150);
    }
  }

  let ejectRes = null;
  try {
    ejectRes = ejectClient(clientId);
    rec.eject = ejectRes.action;
    if (ejectRes.detail) rec.ejectDetail = ejectRes.detail.slice(0, 120);
  } catch (err) {
    rec.eject = "THREW";
    rec.ejectError = String(err && err.message || err).slice(0, 200);
  }

  const finalBytes = fs.readFileSync(cfgPath);
  const diff = firstDiff(original, finalBytes);
  rec.byteIdentical = diff === null;
  if (diff) rec.diff = diff;
  rec.eraArchived = rec.eject === "restored" ? !fs.existsSync(backupsRoot(home, clientId)) : undefined;
  // tmp litter?
  rec.tmpLitter = fs.existsSync(`${cfgPath}.roster-tmp`);
  return rec;
}
// tiny helper to avoid top-level import cycle noise
import { CLIENTS } from "./exp-sync-eject-fuzz-lib.mjs";
function await0() { return CLIENTS; }

const cases = [];
const jsonClients = ["claude-code", "cursor", "openclaw"];
for (const clientId of jsonClients) {
  for (const [name, content] of JSON_VARIANTS) cases.push(runCase(clientId, name, content));
}
for (const [name, content] of TOML_VARIANTS) cases.push(runCase("codex", name, content));

// ---------- probes: exported syncClient on the 6 NON-write clients ----------
const NONWRITE_PROBES = [];
const nonWriteConfigs = {
  "claude-desktop": `{\n  "mcpServers": {\n    "fs": ${SRV("npx")}\n  }\n}\n`,
  "gemini-cli": `{\n  "mcpServers": { "fs": ${SRV("npx")} },\n  "theme": "dark"\n}\n`,
  "hermes": `mcp_servers:\n  fs:\n    command: npx\n    args: ["-y", "srv"]\n`,
  "vscode": `{\n  "servers": { "fs": ${SRV("npx")} }\n}\n`,
  "windsurf": `{\n  "mcpServers": { "fs": ${SRV("npx")} }\n}\n`,
  "zed": `{\n  "context_servers": { "fs": ${SRV("npx")} },\n  "theme": "One Dark"\n}\n`,
};
for (const [clientId, content] of Object.entries(nonWriteConfigs)) {
  const home = freshHome(`a-nonwrite-${clientId}`);
  const original = Buffer.from(content, "utf8");
  const cfgPath = writeConfig(clientId, home, original);
  const rec = { client: clientId, variant: "nonwrite-probe", bytes: original.length };
  try {
    const r = syncClient(clientId);
    rec.sync = r.action;
  } catch (err) {
    rec.sync = "THREW";
    rec.syncError = String(err && err.message || err).slice(0, 200);
  }
  const after = fs.readFileSync(cfgPath);
  rec.configChangedBySync = !after.equals(original);
  if (rec.configChangedBySync) rec.afterSyncPreview = after.toString("utf8").slice(0, 400);
  try {
    const e = ejectClient(clientId);
    rec.eject = e.action;
  } catch (err) { rec.eject = "THREW"; rec.ejectError = String(err?.message || err).slice(0, 200); }
  const fin = fs.readFileSync(cfgPath);
  rec.byteIdentical = fin.equals(original);
  if (!rec.byteIdentical) rec.diff = firstDiff(original, fin);
  NONWRITE_PROBES.push(rec);
}

// ---------- summarize ----------
const mismatches = cases.filter((c) => !c.byteIdentical);
const threw = cases.filter((c) => c.sync === "THREW");
const syncedNotRestored = cases.filter((c) => c.sync === "synced" && c.eject !== "restored");
const litter = cases.filter((c) => c.tmpLitter);
const badWritten = cases.filter((c) => c.sync === "synced" && c.writtenParses === false);
const noRosterEntry = cases.filter((c) => c.sync === "synced" && c.writtenPointsAtRoster === false);

console.log(`\n== EXP A: ${cases.length} cases ==`);
console.log(`byte-identical after full cycle: ${cases.filter((c) => c.byteIdentical).length}/${cases.length}`);
console.log(`sync THREW: ${threw.length} -> ${threw.map((c) => `${c.client}/${c.variant}`).join(", ")}`);
console.log(`synced but eject !== restored: ${syncedNotRestored.length} -> ${syncedNotRestored.map((c) => `${c.client}/${c.variant}:${c.eject}`).join(", ")}`);
console.log(`byte MISMATCHES: ${mismatches.length}`);
for (const m of mismatches) console.log(`  ${m.client}/${m.variant} @${m.diff?.offset} lenA=${m.diff?.lenA} lenB=${m.diff?.lenB}\n    A:${m.diff?.hexA}\n    B:${m.diff?.hexB}`);
console.log(`written-config unparseable: ${badWritten.length} -> ${badWritten.map((c) => `${c.client}/${c.variant}`).join(", ")}`);
console.log(`written-config missing roster entry: ${noRosterEntry.length} -> ${noRosterEntry.map((c) => `${c.client}/${c.variant}`).join(", ")}`);
console.log(`tmp litter: ${litter.length}`);
console.log(`\n== non-write-client probes (exported API; bin.ts blocks these) ==`);
for (const p of NONWRITE_PROBES) console.log(`  ${p.client}: sync=${p.sync}${p.syncError ? ` (${p.syncError.slice(0, 80)})` : ""} changed=${p.configChangedBySync} eject=${p.eject} byteIdentical=${p.byteIdentical}`);

saveSection("a", { cases, nonWriteProbes: NONWRITE_PROBES });
