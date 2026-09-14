import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [shell, outputArg] = process.argv.slice(2);
const win = process.platform === "win32";
assert(win ? ["powershell", "cmd"].includes(shell) : shell === "sh");
const output = path.resolve(outputArg);
assert(!fs.existsSync(output), "refusing to reuse an existing evidence directory");
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "roster-site-command-")));
const home = path.join(root, "home");
const cache = path.join(root, "npm-cache");
const temp = path.join(root, "tmp");
const cwd = path.join(root, "workspace");
const appData = path.join(home, "AppData", "Roaming");
const localAppData = path.join(home, "AppData", "Local");
for (const directory of [home, cache, temp, cwd, appData, localAppData, path.join(home, ".cursor")]) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const npmrc = path.join(root, "npmrc");
fs.writeFileSync(npmrc, "registry=https://registry.npmjs.org/\n@npmmo:registry=https://registry.npmjs.org/\nfund=false\naudit=false\nupdate-notifier=false\n", { mode: 0o600 });
const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
const env = {
  ...(win ? {
    SystemRoot: systemRoot, windir: systemRoot, SystemDrive: process.env.SystemDrive ?? "C:", ComSpec: process.env.ComSpec ?? path.join(systemRoot, "System32", "cmd.exe"),
    PATHEXT: process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD", USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: localAppData, TEMP: temp, TMP: temp,
    Path: [path.dirname(process.execPath), path.join(systemRoot, "System32"), path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0")].join(";"),
  } : { PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(":"), USER: os.userInfo().username, LOGNAME: os.userInfo().username, TMPDIR: temp }),
  HOME: home, ROSTER_HOME: path.join(home, ".roster"), ROSTER_TEST_HOME: home, npm_config_cache: cache, npm_config_userconfig: npmrc, CI: "1", NO_COLOR: "1",
};
const prefix = `${win ? "npx.cmd" : "npx"} --yes @npmmo/roster@0.0.4`;
const commands = { setup: `${prefix} init --no-dense`, help: `${prefix} --help`, sync: `${prefix} sync --client cursor`, eject: `${prefix} eject --client cursor` };
const clientFile = path.join(home, ".cursor", "mcp.json");
const original = JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: ["--version"] } } }, null, 2) + "\n";
fs.writeFileSync(clientFile, original, { mode: 0o600 });
const report = { platform: process.platform, arch: process.arch, node: process.version, shell, package: "@npmmo/roster@0.0.4", commands: [], startedAt: new Date().toISOString(), status: "FAIL" };
const run = (name) => {
  const command = commands[name];
  const executable = shell === "sh" ? "/bin/sh" : shell === "powershell" ? "powershell.exe" : "cmd.exe";
  const args = shell === "sh" ? ["-c", command] : shell === "powershell" ? ["-NoProfile", "-NonInteractive", "-Command", `${command}; exit $LASTEXITCODE`] : ["/d", "/s", "/c", `"${command}"`];
  const started = Date.now();
  const result = spawnSync(executable, args, { cwd, env, encoding: "utf8", timeout: 600_000, windowsHide: true, windowsVerbatimArguments: shell === "cmd" });
  report.commands.push({ name, command, exitCode: result.status, signal: result.signal, durationMs: Date.now() - started, error: result.error ? String(result.error) : undefined });
  fs.writeFileSync(path.join(output, `${name}.log`), `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
try {
  assert.match(run("setup"), /Day-0 receipt/);
  assert.equal(fs.readFileSync(clientFile, "utf8"), original);
  const config = JSON.parse(fs.readFileSync(path.join(env.ROSTER_HOME, "roster.json"), "utf8"));
  assert.equal(config.telemetry.enabled, false);
  assert.equal(Object.keys(config.servers).length, 1);
  assert.equal(fs.existsSync(path.join(env.ROSTER_HOME, "runtime")), false);
  report.clientUnchangedBySetup = true;
  report.embeddingRuntimeInstalled = false;
  report.telemetry = "off";
  run("help");
  run("sync");
  const entry = JSON.parse(fs.readFileSync(clientFile, "utf8")).mcpServers.roster;
  assert(JSON.stringify(entry).includes("@npmmo/roster"));
  run("eject");
  assert.equal(fs.readFileSync(clientFile, "utf8"), original);
  report.restored = true;
  const locks = fs.readdirSync(path.join(cache, "_npx")).map((name) => path.join(cache, "_npx", name, "package-lock.json")).filter((file) => fs.existsSync(file));
  const packages = locks.flatMap((file) => Object.entries(JSON.parse(fs.readFileSync(file, "utf8")).packages ?? {}).filter(([key]) => key === "node_modules/@npmmo/roster" || key.endsWith("/node_modules/@npmmo/roster")).map(([, value]) => value));
  const expected = "sha512-W7421CxODb7UO8DiZrUK4+ozyUO90oGCqgqgMKGvrwTORxJD/QdoQRBovQ2Wk3Cw5x7+2i2AtQHl/8j2zLQHCg==";
  assert(packages.some((entry) => entry.version === "0.0.4" && entry.integrity === expected));
  report.integrity = expected;
  report.status = "PASS";
} catch (error) {
  report.error = String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
