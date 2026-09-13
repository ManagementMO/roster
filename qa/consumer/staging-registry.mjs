#!/usr/bin/env node
// Loopback-only staging registry (Verdaccio, pinned) serving ONLY the candidate
// @npmmo/roster tarball. Everything (install prefix, storage, htpasswd, token,
// logs) lives under --dir, which is test-owned and disposable.
//
//   node staging-registry.mjs start --dir D --port 4873 --tarball roster-cli-0.0.1.tgz
//   node staging-registry.mjs stop  --dir D
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const VERDACCIO_SPEC = "verdaccio@6.10.2";
const VERDACCIO_INTEGRITY = "sha512-avuvgx9EN9PQUg33e0ea+ltTs6CKffJVjS0h2odtULgIrHMqCdb7DHN6hg3qBou7OFdPiJG3sgtCc5VcrYj85A==";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const dir = path.resolve(opt("dir", "staging-registry"));
const port = Number(opt("port", "4873"));
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function run(command, argv, opts = {}) {
  const r = spawnSync(command, argv, { encoding: "utf8", shell: process.platform === "win32", ...opts });
  if (r.status !== 0) {
    throw new Error(`${command} ${argv.join(" ")} failed (${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
}

async function waitReady(url, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}-/ping`);
      if (r.ok) return;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`registry at ${url} did not become ready`);
}

if (cmd === "start") {
  const tarball = path.resolve(opt("tarball"));
  const candidateSha = sha256(fs.readFileSync(tarball));
  fs.mkdirSync(dir, { recursive: true });
  const tool = path.join(dir, "tool");
  const storage = path.join(dir, "storage");
  const conf = path.join(dir, "conf");
  for (const d of [tool, storage, conf, path.join(dir, "cache"), path.join(dir, "plugins")]) fs.mkdirSync(d, { recursive: true });

  const cache = path.join(dir, "npm-cache");
  const toolEnv = { ...process.env, npm_config_cache: cache, npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false" };
  fs.writeFileSync(path.join(tool, "package.json"), JSON.stringify({ name: "roster-qa-registry-tool", private: true }, null, 2));
  run(npmCmd, ["install", VERDACCIO_SPEC, "--no-save", "--ignore-scripts", "--registry", "https://registry.npmjs.org/"], { cwd: tool, env: toolEnv });
  // Provenance of the registry implementation itself.
  const lockLike = JSON.parse(run(npmCmd, ["ls", "verdaccio", "--json"], { cwd: tool, env: toolEnv }));
  const installedVersion = lockLike.dependencies?.verdaccio?.version;
  const meta = await (await fetch(`https://registry.npmjs.org/verdaccio/6.10.2`)).json();
  if (installedVersion !== "6.10.2" || meta.dist.integrity !== VERDACCIO_INTEGRITY) {
    throw new Error(`verdaccio provenance mismatch: installed=${installedVersion} integrity=${meta.dist.integrity}`);
  }

  const configPath = path.join(conf, "config.yaml");
  const yamlPath = (p) => JSON.stringify(p);
  fs.writeFileSync(configPath, [
    `storage: ${yamlPath(storage)}`,
    `plugins: ${yamlPath(path.join(dir, "plugins"))}`,
    "web:",
    "  enable: false",
    "auth:",
    "  htpasswd:",
    `    file: ${yamlPath(path.join(conf, "htpasswd"))}`,
    "    max_users: 5",
    "uplinks:",
    "  npmjs:",
    "    url: https://registry.npmjs.org/",
    "packages:",
    "  \"@npmmo/roster\":",
    "    access: $all",
    "    publish: $authenticated",
    "    unpublish: $authenticated",
    "  \"**\":",
    "    access: $all",
    "    publish: $nobody",
    "    proxy: npmjs",
    "server:",
    "  keepAliveTimeout: 60",
    `listen: 127.0.0.1:${port}`,
    "security:",
    "  api:",
    "    legacy: true",
    `log: { type: file, path: ${yamlPath(path.join(dir, "verdaccio.log"))}, level: info }`,
    "",
  ].join("\n"));

  const bin = path.join(tool, "node_modules", "verdaccio", "bin", "verdaccio");
  const out = fs.openSync(path.join(dir, "verdaccio.out"), "a");
  const child = spawn(process.execPath, [bin, "--config", configPath], {
    cwd: dir,
    // libuv puts non-detached Windows children in a kill-on-close job object,
    // so the registry would die with this launcher process.
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, VERDACCIO_STORAGE_PATH: storage },
    windowsHide: true,
  });
  child.unref();
  fs.writeFileSync(path.join(dir, "verdaccio.pid"), String(child.pid));
  const url = `http://127.0.0.1:${port}/`;
  await waitReady(url, 60_000);

  // Test-owned publisher identity (random password, token kept in --dir only).
  const password = crypto.randomBytes(18).toString("base64url");
  const res = await fetch(`${url}-/user/org.couchdb.user:roster-qa`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "roster-qa", password, type: "user", roles: [], date: new Date().toISOString() }),
  });
  const body = await res.json();
  if (!res.ok || !body.token) throw new Error(`could not create staging user: ${res.status}`);
  const publisherRc = path.join(conf, "publisher.npmrc");
  fs.writeFileSync(publisherRc, `//127.0.0.1:${port}/:_authToken=${body.token}\nregistry=${url}\n@npmmo:registry=${url}\n`, { mode: 0o600 });

  run(npmCmd, ["publish", tarball, "--registry", url, `--@npmmo:registry=${url}`, "--userconfig", publisherRc, "--ignore-scripts"], { cwd: dir, env: { ...toolEnv, npm_config_cache: path.join(dir, "publish-cache") } });

  const packument = await (await fetch(`${url}@npmmo%2froster`)).json();
  const version = packument.versions?.["0.0.1"];
  const served = Buffer.from(await (await fetch(version.dist.tarball)).arrayBuffer());
  const servedSha = sha256(served);
  const summary = {
    url,
    verdaccio: { version: installedVersion, integrity: VERDACCIO_INTEGRITY },
    package: "@npmmo/roster@0.0.1",
    candidateTarball: tarball,
    candidateSha256: candidateSha,
    servedSha256: servedSha,
    servedIntegrity: version.dist.integrity,
    versions: Object.keys(packument.versions ?? {}),
    distTags: packument["dist-tags"],
    match: servedSha === candidateSha,
    pid: child.pid,
  };
  fs.writeFileSync(path.join(dir, "registry-summary.json"), JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.match) process.exit(1);
} else if (cmd === "stop") {
  const pidFile = path.join(dir, "verdaccio.pid");
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"]);
      else process.kill(pid, "SIGTERM");
    } catch { /* already gone */ }
  }
} else {
  process.stderr.write("usage: staging-registry.mjs start|stop --dir D [--port N] [--tarball T]\n");
  process.exit(2);
}
