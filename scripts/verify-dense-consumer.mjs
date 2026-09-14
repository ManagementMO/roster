import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [tarballArg, outputArg, expectedSha, expectedBackend, offlineRoot] = process.argv.slice(2);
assert(tarballArg && outputArg && expectedSha && ["native", "wasm"].includes(expectedBackend));
const tarball = path.resolve(tarballArg);
assert.equal(crypto.createHash("sha256").update(fs.readFileSync(tarball)).digest("hex"), expectedSha);
const output = path.resolve(outputArg);
assert(!fs.existsSync(output), "refusing to reuse an existing evidence directory");
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const root = offlineRoot ? fs.realpathSync(offlineRoot) : fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rpt-")));
const home = path.join(root, "home");
const project = path.join(root, "project");
const runtime = path.join(home, ".roster", "runtime");
const cache = path.join(root, "npm-cache");
const temp = path.join(root, "tmp");
for (const dir of [home, project, cache, temp, path.join(home, ".cursor"), path.join(home, "AppData", "Roaming"), path.join(home, "AppData", "Local")]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const npmrc = path.join(root, "npmrc");
fs.writeFileSync(npmrc, "registry=https://registry.npmjs.org/\n@npmmo:registry=https://registry.npmjs.org/\nfund=false\naudit=false\nupdate-notifier=false\n", { mode: 0o600 });
const win = process.platform === "win32";
const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
const env = {
  ...(win ? { SystemRoot: systemRoot, windir: systemRoot, SystemDrive: process.env.SystemDrive ?? "C:", ComSpec: process.env.ComSpec ?? path.join(systemRoot, "System32", "cmd.exe"), PATHEXT: ".COM;.EXE;.BAT;.CMD", USERPROFILE: home, APPDATA: path.join(home, "AppData", "Roaming"), LOCALAPPDATA: path.join(home, "AppData", "Local"), TEMP: temp, TMP: temp, Path: [path.dirname(process.execPath), path.join(systemRoot, "System32"), path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0")].join(";") } : { PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(":"), TMPDIR: temp, USER: os.userInfo().username }),
  HOME: home, ROSTER_TEST_HOME: home, ROSTER_HOME: path.join(home, ".roster"), npm_config_cache: cache, npm_config_userconfig: npmrc, CI: "1", NO_COLOR: "1",
};
const npmCli = [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")].find((file) => fs.existsSync(file));
assert(npmCli, "npm CLI entrypoint not found beside this Node installation");
const report = { root, offline: Boolean(offlineRoot), platform: process.platform, arch: process.arch, node: process.version, ramGiB: os.totalmem() / 2 ** 30, tarballSha256: expectedSha, expectedBackend, status: "FAIL", startedAt: new Date().toISOString(), commands: [], drafts: [] };
const run = (name, args, timeout = 600_000) => {
  const result = spawnSync(process.execPath, args, { cwd: project, env, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, `${name}.log`), `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  report.commands.push({ name, exitCode: result.status, signal: result.signal, error: result.error ? String(result.error) : undefined });
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  return result.stdout;
};
let client;
let transport;
const expectedVersion = process.env.EXPECTED_PACKAGE_VERSION ?? "0.0.3";
const upgradeFrom = offlineRoot ? undefined : process.env.ROSTER_UPGRADE_FROM || undefined;
try {
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "roster-portability-consumer", private: true, type: "module" }));
  if (!offlineRoot) run("install", [npmCli, "install", upgradeFrom ? `@npmmo/roster@${upgradeFrom}` : tarball, "--no-audit", "--no-fund"]);
  const packageDir = path.join(project, "node_modules", "@npmmo", "roster");
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
  assert.equal(manifest.name, "@npmmo/roster");
  assert.equal(manifest.version, upgradeFrom ?? expectedVersion);
  report.version = expectedVersion;
  const bin = path.join(packageDir, "bundle", "bin.js");
  const req = createRequire(path.join(packageDir, "package.json"));
  const fixture = path.join(root, "fixture.mjs");
  fs.writeFileSync(fixture, `
    let buffer = "";
    const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\\n")) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!line.trim()) continue;
        const m = JSON.parse(line);
        if (m.method === "initialize") send(m.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } });
        else if (m.method === "tools/list") send(m.id, { tools: [{ name: "read_note", description: "Read a note from the project", inputSchema: { type: "object", properties: {} } }, { name: "list_files", description: "List project source files", inputSchema: { type: "object", properties: {} } }] });
        else if (m.method === "tools/call") send(m.id, { content: [{ type: "text", text: "fixture result" }] });
        else if (m.id !== undefined) send(m.id, {});
      }
    });
  `);
  const configFile = path.join(home, ".cursor", "mcp.json");
  const original = JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [fixture] } } }, null, 2) + "\n";
  fs.writeFileSync(configFile, original);
  run("help", [bin, "--help"]);
  run("init", [bin, "init", "--no-dense"]);
  assert.equal(fs.readFileSync(configFile, "utf8"), original);
  if (!offlineRoot) assert(!fs.existsSync(runtime));
  const rosterConfig = path.join(env.ROSTER_HOME, "roster.json");
  const config = JSON.parse(fs.readFileSync(rosterConfig, "utf8"));
  assert.equal(config.telemetry.enabled, false);
  run("sync", [bin, "sync", "--client", "cursor"]);
  const launcher = JSON.parse(fs.readFileSync(configFile, "utf8")).mcpServers.roster;
  if (upgradeFrom) {
    run("baseline-dense-enable", [bin, "dense", "enable"], 900_000);
    const snapshots = new Map();
    const record = (file) => snapshots.set(file, fs.readFileSync(file));
    const walk = (directory) => { for (const item of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, item.name); if (item.isDirectory()) walk(file); else if (item.isFile()) record(file); } };
    record(configFile);
    record(rosterConfig);
    walk(path.join(env.ROSTER_HOME, "backups"));
    run("upgrade-install", [npmCli, "install", tarball, "--no-audit", "--no-fund"]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8")).version, expectedVersion);
    for (const [file, bytes] of snapshots) assert(fs.readFileSync(file).equals(bytes), "upgrade changed user configuration or backup bytes");
    report.upgrade = { from: upgradeFrom, to: expectedVersion, preservedFiles: snapshots.size };
  }
  if (!offlineRoot) run("dense-enable", [bin, "dense", "enable"], 900_000);
  const status = run("dense-status", [bin, "dense", "status"]);
  assert.match(status, expectedBackend === "wasm" ? /READY \(WASM CPU fallback/ : /READY \(native/);
  if (!offlineRoot) assert(!fs.existsSync(path.join(runtime, "cache", "wasm")), "readiness must not download model artifacts");
  fs.copyFileSync(path.join(runtime, "package-lock.json"), path.join(output, "dense-package-lock.json"));
  const configured = JSON.parse(fs.readFileSync(rosterConfig, "utf8"));
  configured.embeddings = "auto";
  configured.mode = "five";
  fs.writeFileSync(rosterConfig, JSON.stringify(configured), { mode: 0o600 });
  const { Client } = await import(pathToFileURL(req.resolve("@modelcontextprotocol/sdk/client/index.js")).href);
  const { StdioClientTransport } = await import(pathToFileURL(req.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href);
  const dbScript = `const r=require(${JSON.stringify(req.resolve("better-sqlite3"))});const d=new r(${JSON.stringify(path.join(env.ROSTER_HOME, "coach.db"))},{readonly:true});console.log(JSON.stringify({base:d.prepare("SELECT count(*) n,max(dims) dims FROM vec").get(),needs:d.prepare("SELECT count(*) n,max(dims) dims FROM need_vec").get()}));d.close();`;
  const expectedDims = os.totalmem() >= 8 * 1024 ** 3 ? 256 : 384;
  client = new Client({ name: "portable-runtime-consumer", version: "1" });
  transport = new StdioClientTransport({ command: launcher.command, args: launcher.args, cwd: project, env, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (data) => { stderr = (stderr + data.toString()).slice(-16_384); });
  await client.connect(transport, { timeout: 30_000 });
  const initialQuery = spawnSync(process.execPath, ["-e", dbScript], { cwd: project, env, encoding: "utf8", timeout: 10_000, windowsHide: true });
  assert.equal(initialQuery.status, 0, initialQuery.stderr);
  const initialNeeds = JSON.parse(initialQuery.stdout).needs.n;
  const need = `read a note from my project ${crypto.randomUUID()}`;
  const started = Date.now();
  let warm = false;
  while (Date.now() - started < 12 * 60_000) {
    const before = Date.now();
    const result = await client.callTool({ name: "draft", arguments: { need, k: 2 } }, undefined, { timeout: 30_000 });
    const durationMs = Date.now() - before;
    assert(!result.isError);
    const body = JSON.parse(result.content.find((part) => part.type === "text").text);
    assert(body.starters.length > 0);
    const query = spawnSync(process.execPath, ["-e", dbScript], { cwd: project, env, encoding: "utf8", timeout: 10_000, windowsHide: true });
    assert.equal(query.status, 0, query.stderr);
    const vectors = JSON.parse(query.stdout);
    report.drafts.push({ elapsedMs: Date.now() - started, durationMs, ...vectors });
    if (vectors.base.n > 0 && vectors.needs.n > initialNeeds) {
      assert.equal(vectors.base.dims, expectedDims);
      assert.equal(vectors.needs.dims, expectedDims);
      const called = await client.callTool({ name: "call", arguments: { tool: body.starters[0].id, args: {}, draft_id: body.draft_id } }, undefined, { timeout: 30_000 });
      assert(!called.isError);
      warm = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fs.writeFileSync(path.join(output, "serve-stderr.log"), stderr);
  assert(warm, "installed CLI did not produce base and need vectors before the deadline");
  await client.close();
  client = undefined;
  run("eject", [bin, "eject", "--client", "cursor"]);
  assert.equal(fs.readFileSync(configFile, "utf8"), original);
  report.restored = true;
  report.expectedDims = expectedDims;
  report.status = "PASS";
} catch (error) {
  report.error = String(error);
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
