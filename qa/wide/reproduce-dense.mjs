import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const option = (name) => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined;
const sha = "3f42c2d5c0648b9c3a64fbb7eadedf27dd507f1f9d6a0e8731d10fcc385895a0";
if (!args.includes("--inside")) {
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const output = path.resolve(option("out"));
  const image = option("image");
  const platform = option("platform");
  assert(image && platform);
  fs.mkdirSync(output, { mode: 0o700 });
  const evidence = path.join(output, "evidence");
  fs.mkdirSync(evidence, { mode: 0o777 });
  fs.chmodSync(evidence, 0o777);
  const token = crypto.randomBytes(6).toString("hex");
  const name = `roster-dense-repro-${token}`;
  const files = ["qa/wide/reproduce-dense.mjs", "qa/wide/product-dense.mjs", "qa/wide/dense-probe.mjs", "qa/privacy/probe.mjs", "qa/consumer/fetch-public.mjs"];
  const hashes = Object.fromEntries(files.map((file) => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(repository, file))).digest("hex")]));
  const metadata = { image, platform, container: name, candidateSha: sha, host: { platform: process.platform, arch: process.arch }, harnessHashes: hashes, startedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(output, "metadata.json"), JSON.stringify(metadata, null, 2));
  const log = fs.openSync(path.join(output, "run.log"), "w", 0o600);
  try {
    const result = spawnSync("docker", ["run", "--rm", "--init", "--name", name, "--label", `roster.repro=${token}`, "--platform", platform, "--user", "node", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "256", "--memory", "3g", "--cpus", "2", "--mount", `type=bind,source=${path.join(repository, "qa")},target=/qa,readonly`, "--mount", `type=bind,source=${evidence},target=/evidence`, "--env", `CANDIDATE_SHA256=${sha}`, image, "node", "/qa/wide/reproduce-dense.mjs", "--inside"], { stdio: ["ignore", log, log], timeout: 1_200_000 });
    metadata.exitCode = result.status;
    metadata.signal = result.signal;
    metadata.error = result.error ? String(result.error) : undefined;
    process.exitCode = result.status === 0 ? 0 : 1;
  } finally {
    fs.closeSync(log);
    const state = spawnSync("docker", ["inspect", "--format", "{{index .Config.Labels \"roster.repro\"}}", name], { encoding: "utf8" });
    if (state.status === 0 && state.stdout.trim() === token) spawnSync("docker", ["stop", "--time", "5", name], { timeout: 15_000 });
    metadata.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, "metadata.json"), JSON.stringify(metadata, null, 2));
    console.log(JSON.stringify(metadata));
  }
} else {
  assert.notEqual(process.getuid(), 0);
  const root = "/tmp/roster dense reproduction";
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  const runtime = path.join(home, ".roster", "runtime");
  const evidence = "/evidence";
  const env = { ...process.env, HOME: home, ROSTER_HOME: path.join(home, ".roster"), ROSTER_TEST_HOME: home, npm_config_cache: path.join(root, "npm-cache"), npm_config_userconfig: path.join(root, "npmrc"), NO_COLOR: "1", CI: "1" };
  const commands = [];
  const run = (id, command, argv, options = {}) => {
    const started = Date.now();
    const result = spawnSync(command, argv, { env, encoding: "utf8", timeout: 900_000, maxBuffer: 32 * 1024 * 1024, ...options });
    const entry = { id, command, args: argv, exitCode: result.status, signal: result.signal, error: result.error ? String(result.error) : undefined, durationMs: Date.now() - started };
    commands.push(entry);
    fs.writeFileSync(path.join(evidence, `${id}.log`), `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    fs.writeFileSync(path.join(evidence, "commands.json"), JSON.stringify(commands, null, 2));
    console.log(JSON.stringify(entry));
    return result;
  };
  const ok = (result) => assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  try {
    const header = process.report.getReport().header;
    fs.writeFileSync(path.join(evidence, "environment.json"), JSON.stringify({ uid: process.getuid(), gid: process.getgid(), node: process.version, arch: process.arch, glibc: header.glibcVersionRuntime ?? null, os: fs.readFileSync("/etc/os-release", "utf8"), memory: os.totalmem(), constrainedMemory: process.constrainedMemory?.() }, null, 2));
    ok(run("fetch", process.execPath, ["/qa/consumer/fetch-public.mjs", path.join(root, "candidate")]));
    ok(run("prepare", process.execPath, ["/qa/privacy/probe.mjs", "prepare", root, path.join(root, "candidate", "npmmo-roster-0.0.2.tgz")]));
    ok(run("install", "npm", ["install", "@npmmo/roster@0.0.2", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org/", "--@npmmo:registry=https://registry.npmjs.org/"], { cwd: project }));
    ok(run("lexical-before", process.execPath, ["/qa/privacy/probe.mjs", "exercise", root]));
    const bin = path.join(project, "node_modules/@npmmo/roster/bundle/bin.js");
    ok(run("status-before", process.execPath, [bin, "dense", "status"]));
    ok(run("enable", process.execPath, [bin, "dense", "enable"]));
    ok(run("status-after", process.execPath, [bin, "dense", "status"]));
    const inference = run("inference", process.execPath, ["/qa/wide/dense-probe.mjs", root]);
    const product = run("product", process.execPath, ["/qa/wide/product-dense.mjs", root, evidence]);
    process.exitCode = inference.status === 0 && product.status === 0 ? 0 : 1;
  } finally {
    for (const [from, name] of [[path.join(project, "package-lock.json"), "consumer-lock.json"], [path.join(project, "node_modules/@npmmo/roster/package.json"), "installed-manifest.json"], [path.join(runtime, "package-lock.json"), "runtime-lock.json"], [path.join(runtime, "package.json"), "runtime-manifest.json"], [path.join(home, ".roster", "roster.json"), "synthetic-roster.json"]]) {
      if (fs.existsSync(from)) {
        fs.copyFileSync(from, path.join(evidence, name));
        fs.chmodSync(path.join(evidence, name), 0o644);
      }
    }
  }
}
