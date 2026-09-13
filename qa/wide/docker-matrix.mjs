import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback;
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = option("out") ? path.resolve(option("out")) : fs.mkdtempSync(path.join(os.tmpdir(), "roster-wide-docker-"));
if (option("out")) fs.mkdirSync(output, { recursive: false, mode: 0o700 });
fs.chmodSync(output, 0o700);
const candidateSha = "3f42c2d5c0648b9c3a64fbb7eadedf27dd507f1f9d6a0e8731d10fcc385895a0";
const candidateIntegrity = "sha512-+Cw+KH1vdQfznx/0iGbZl62WkImkyLbz8F8sCU0Hj0Xd22bcfhPmHOUD04WABb2fzWpt9e89Lbc5fG8CC1YW1g==";
const only = option("profiles") ? new Set(option("profiles").split(",")) : null;
const dense = !args.includes("--no-dense");
const selected = [];
for (const node of ["24.20.0", "22.23.2", "26.8.1"]) {
  for (const family of ["debian", "alpine"]) {
    for (const arch of ["arm64", "amd64"]) {
      const profile = { id: `${family}-${arch}-node${node}`, node, family, arch, imageTag: `node:${node}-${family === "debian" ? "bookworm-slim" : "alpine"}` };
      if (!only || only.has(profile.id)) selected.push(profile);
    }
  }
}
assert(selected.length > 0, "no profiles selected");
if (only) assert.equal(selected.length, only.size, "unknown profile selected");
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report = {
  package: "@npmmo/roster@0.0.2", candidateSha, startedAt: new Date().toISOString(),
  gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim(),
  host: { platform: process.platform, arch: process.arch, node: process.version },
  requestedDense: dense,
  harnessHashes: Object.fromEntries(["qa/wide/docker-matrix.mjs", "qa/wide/dense-probe.mjs", "qa/privacy/probe.mjs", "qa/consumer/fetch-public.mjs"].map((file) => [file, hash(path.join(repository, file))])),
  profiles: [],
};
const reportPath = path.join(output, "matrix.json");
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
const active = new Set();
for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => {
    for (const name of active) {
      try { execFileSync("docker", ["stop", "--time", "3", name], { timeout: 15_000, stdio: "ignore" }); }
      catch { console.error(`Cleanup needs inspection: ${name}`); }
    }
    process.exit(exitCode);
  });
}
const expectedStages = ["image-pull", "container-start", "environment", "public-artifact", "prepare-fixture", "public-install", "installed-identity", "online-core", "remove-network", "network-membership", "offline-interfaces", "offline-core", ...(dense ? ["restore-network"] : []), "dense-enable", "dense-inference", "cleanup"];
report.expectedStages = expectedStages;
const run = (profile, stage, dockerArgs, timeout = 180_000) => new Promise((resolve) => {
  const started = Date.now();
  const logfile = path.join(output, profile.id, `${stage}.log`);
  fs.writeFileSync(logfile, `docker ${dockerArgs.map((arg) => JSON.stringify(arg)).join(" ")}\n`, { mode: 0o600 });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let spawnError;
  let forceTimer;
  const child = spawn("docker", dockerArgs, { stdio: ["ignore", "pipe", "pipe"] });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    forceTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
  }, timeout);
  child.stdout.on("data", (chunk) => {
    fs.appendFileSync(logfile, chunk);
    stdout = (stdout + chunk).slice(-128_000);
  });
  child.stderr.on("data", (chunk) => {
    fs.appendFileSync(logfile, chunk);
    stderr = (stderr + chunk).slice(-128_000);
  });
  child.on("error", (error) => { spawnError = String(error); });
  child.on("close", (code, signal) => {
    clearTimeout(timer);
    clearTimeout(forceTimer);
    const result = { stage, status: code === 0 && !timedOut && !spawnError ? "PASS" : "FAIL", exitCode: code, signal, timedOut, spawnError, durationMs: Date.now() - started, log: path.relative(output, logfile), stdout, stderr };
    profile.steps.push(result);
    save();
    console.log(`[${profile.id}] ${stage}: ${result.status} exit=${code} ${result.durationMs}ms`);
    resolve(result);
  });
});
const requirePass = (result, infrastructure = false) => {
  if (result.status !== "PASS") throw Object.assign(new Error(`${result.stage} did not pass`), { stage: result.stage, infrastructure });
  return result;
};
const record = (profile, stage, status, details) => {
  profile.steps.push({ stage, status, details });
  save();
};
const root = "/tmp/roster-wide/path with spaces";
const archive = `${root}/candidate/npmmo-roster-0.0.2.tgz`;
const binary = `${root}/project/node_modules/@npmmo/roster/bundle/bin.js`;
const factsCode = `const fs=require("node:fs"),os=require("node:os"),cp=require("node:child_process");if(process.getuid()===0)throw new Error("root is not a valid consumer");const h=process.report.getReport().header;console.log(JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,uid:process.getuid(),gid:process.getgid(),uv:process.versions.uv,abi:process.versions.modules,glibc:h.glibcVersionRuntime??null,os:fs.readFileSync("/etc/os-release","utf8"),memory:os.totalmem(),npm:cp.execFileSync("npm",["--version"],{encoding:"utf8"}).trim()}));`;
const identityCode = `const fs=require("node:fs"),assert=require("node:assert/strict"),path=require("node:path");const p=${JSON.stringify(`${root}/project`)};const m=JSON.parse(fs.readFileSync(path.join(p,"node_modules/@npmmo/roster/package.json")));assert.equal(m.name,"@npmmo/roster");assert.equal(m.version,"0.0.2");const l=JSON.parse(fs.readFileSync(path.join(p,"package-lock.json")));const entry=l.packages["node_modules/@npmmo/roster"];assert.equal(entry.integrity,${JSON.stringify(candidateIntegrity)});assert.equal(new URL(entry.resolved).hostname,"registry.npmjs.org");assert(!fs.lstatSync(path.join(p,"node_modules/@npmmo/roster")).isSymbolicLink());console.log(JSON.stringify({version:m.version,integrity:entry.integrity,resolved:entry.resolved}));`;
const networkCode = `const assert=require("node:assert/strict"),os=require("node:os");const interfaces=os.networkInterfaces();assert(Object.values(interfaces).flat().every(i=>i.internal),"external interface remains");console.log(JSON.stringify(interfaces));`;
console.log(`Evidence directory: ${output}`);
save();
for (const definition of selected) {
  const profile = { ...definition, execution: os.arch() === "arm64" && definition.arch === "amd64" ? "emulated" : "native", status: "IN_PROGRESS", steps: [] };
  report.profiles.push(profile);
  fs.mkdirSync(path.join(output, profile.id), { mode: 0o777 });
  fs.chmodSync(path.join(output, profile.id), 0o777);
  const name = `roster-wide-${definition.family}-${definition.arch}-${crypto.randomBytes(5).toString("hex")}`;
  profile.container = name;
  let started = false;
  const inside = (stage, command, timeout) => run(profile, stage, ["exec", name, ...command], timeout);
  try {
    const pull = requirePass(await run(profile, "image-pull", ["pull", "--platform", `linux/${profile.arch}`, profile.imageTag], 600_000), true);
    const digest = `${pull.stdout}\n${pull.stderr}`.match(/Digest: (sha256:[a-f0-9]{64})/)?.[1];
    assert(digest, "image digest was not recorded");
    profile.imageDigest = digest;
    const image = `node@${digest}`;
    requirePass(await run(profile, "container-start", ["run", "--detach", "--rm", "--init", "--name", name, "--label", "roster.verification=wide", "--platform", `linux/${profile.arch}`, "--network", "bridge", "--user", "node", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "256", "--memory", "3g", "--cpus", "2", "--mount", `type=bind,source=${path.join(repository, "qa")},target=/qa,readonly`, "--mount", `type=bind,source=${path.join(output, profile.id)},target=/evidence`, "--env", `CANDIDATE_SHA256=${candidateSha}`, "--env", `HOME=${root}/home`, "--env", `ROSTER_TEST_HOME=${root}/home`, "--env", `ROSTER_HOME=${root}/home/.roster`, "--env", `npm_config_cache=${root}/npm-cache`, "--env", `npm_config_userconfig=${root}/npmrc`, "--env", "NO_COLOR=1", "--env", "CI=1", image, "node", "-e", "setInterval(()=>{},60000)"], 180_000), true);
    started = true;
    active.add(name);
    const facts = requirePass(await inside("environment", ["node", "-e", factsCode]), true);
    profile.environment = JSON.parse(facts.stdout.trim());
    assert.equal(profile.environment.node, `v${profile.node}`);
    assert.equal(profile.environment.arch, profile.arch === "amd64" ? "x64" : "arm64");
    assert.equal(profile.environment.uid, 1000);
    requirePass(await inside("public-artifact", ["node", "/qa/consumer/fetch-public.mjs", `${root}/candidate`]), true);
    requirePass(await inside("prepare-fixture", ["node", "/qa/privacy/probe.mjs", "prepare", root, archive]), true);
    requirePass(await run(profile, "public-install", ["exec", "--workdir", `${root}/project`, name, "npm", "install", "@npmmo/roster@0.0.2", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org/", "--@npmmo:registry=https://registry.npmjs.org/"], 600_000));
    requirePass(await inside("installed-identity", ["node", "-e", identityCode]));
    requirePass(await inside("online-core", ["node", "/qa/privacy/probe.mjs", "exercise", root], 180_000));
    requirePass(await run(profile, "remove-network", ["network", "disconnect", "bridge", name]), true);
    const networks = requirePass(await run(profile, "network-membership", ["inspect", "--format", "{{json .NetworkSettings.Networks}}", name]), true);
    assert.equal(Object.keys(JSON.parse(networks.stdout.trim())).length, 0);
    requirePass(await inside("offline-interfaces", ["node", "-e", networkCode]), true);
    requirePass(await inside("offline-core", ["node", "/qa/privacy/probe.mjs", "exercise", root], 180_000));
    if (dense) {
      requirePass(await run(profile, "restore-network", ["network", "connect", "bridge", name]), true);
      requirePass(await inside("dense-enable", ["node", binary, "dense", "enable"], 1_200_000));
      requirePass(await inside("dense-inference", ["node", "/qa/wide/dense-probe.mjs", root], 900_000));
    } else {
      record(profile, "dense-enable", "NOT RUN", "not requested for this screening pass");
      record(profile, "dense-inference", "NOT RUN", "not requested for this screening pass");
    }
    profile.status = "PASS";
  } catch (error) {
    profile.status = error.infrastructure ? "BLOCKED" : "FAIL";
    const last = profile.steps.at(-1);
    if (last?.status === "PASS") {
      last.status = "FAIL";
      last.validationError = String(error);
    }
    profile.failure = { stage: error.stage ?? last?.stage, message: String(error), attribution: error.infrastructure ? "environment/harness" : "requires triage" };
    console.log(`[${profile.id}] ${profile.status}: ${error.message}`);
  } finally {
    for (const stage of expectedStages) {
      if (stage !== "cleanup" && !profile.steps.some((step) => step.stage === stage)) record(profile, stage, "BLOCKED", "an earlier required stage did not pass");
    }
    if (started) {
      const cleanup = await run(profile, "cleanup", ["stop", "--time", "10", name], 30_000);
      active.delete(name);
      if (cleanup.status !== "PASS") {
        if (profile.status === "PASS") profile.status = "BLOCKED";
        profile.cleanupFailure = true;
      }
    } else {
      record(profile, "cleanup", "NOT RUN", "no test container was started");
    }
    profile.finishedAt = new Date().toISOString();
    save();
  }
}
report.finishedAt = new Date().toISOString();
report.summary = report.profiles.reduce((summary, profile) => ({ ...summary, [profile.status]: (summary[profile.status] ?? 0) + 1 }), {});
save();
console.log(JSON.stringify({ report: reportPath, summary: report.summary }));
process.exitCode = report.profiles.some((profile) => profile.status !== "PASS") ? 1 : 0;
