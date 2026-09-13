import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const option = (name) => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined;
const sha = "3f42c2d5c0648b9c3a64fbb7eadedf27dd507f1f9d6a0e8731d10fcc385895a0";
if (args.includes("--inside")) {
  assert.notEqual(process.getuid(), 0);
  const fetched = spawnSync(process.execPath, ["/qa/consumer/fetch-public.mjs", "/tmp/candidate"], { stdio: "inherit", timeout: 120_000 });
  assert.equal(fetched.status, 0);
  const consumer = spawnSync(process.execPath, ["/qa/consumer/consumer-qa.mjs", "--out", "/evidence", "--work", "/tmp/consumer-work", "--tarball", "/tmp/candidate/npmmo-roster-0.0.2.tgz", "--node-label", process.version, "--repo", "/repo", "--dense"], { stdio: "inherit", timeout: 2_700_000 });
  const gate = spawnSync(process.execPath, ["/qa/consumer/result-gate.mjs", "/evidence/results.json"], { stdio: "inherit", timeout: 30_000 });
  const files = [
    ["/tmp/candidate/public-identity.json", "public-identity.json"],
    ["/tmp/consumer-work/functional/prefix/lib/node_modules/.package-lock.json", "global-lock.json"],
    ["/tmp/consumer-work/functional/home/.roster/runtime/package-lock.json", "runtime-lock.json"],
    ["/tmp/consumer-work/local-registry/project/package-lock.json", "consumer-lock.json"],
  ];
  for (const [source, destination] of files) {
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join("/evidence", destination));
      fs.chmodSync(path.join("/evidence", destination), 0o644);
    }
  }
  process.exitCode = consumer.status === 0 && gate.status === 0 ? 0 : 1;
} else {
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
  const name = `roster-full-${token}`;
  const files = ["qa/wide/full-consumer.mjs", "qa/wide/Dockerfile", "qa/consumer/consumer-qa.mjs", "qa/consumer/result-gate.mjs", "qa/consumer/fetch-public.mjs", "qa/consumer/fixtures/fixture-server.mjs"];
  const metadata = { image, platform, container: name, candidateSha: sha, harnessHashes: Object.fromEntries(files.map((file) => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(repository, file))).digest("hex")])), startedAt: new Date().toISOString(), scope: "instrumented container with bash/procps/strace; unmodified public product" };
  const imageId = spawnSync("docker", ["image", "inspect", image, "--format", "{{.Id}}"], { encoding: "utf8" });
  assert.equal(imageId.status, 0);
  metadata.imageId = imageId.stdout.trim();
  fs.writeFileSync(path.join(output, "metadata.json"), JSON.stringify(metadata, null, 2));
  const logfile = fs.openSync(path.join(output, "run.log"), "w", 0o600);
  try {
    const result = spawnSync("docker", ["run", "--rm", "--init", "--name", name, "--label", `roster.full=${token}`, "--platform", platform, "--user", "node", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "512", "--memory", "3g", "--cpus", "2", "--mount", `type=bind,source=${path.join(repository, "qa")},target=/qa,readonly`, "--mount", `type=bind,source=${path.join(repository, "suites")},target=/repo/suites,readonly`, "--mount", `type=bind,source=${path.join(repository, "docs/signing")},target=/repo/docs/signing,readonly`, "--mount", `type=bind,source=${evidence},target=/evidence`, "--env", `CANDIDATE_SHA256=${sha}`, "--env", "NO_COLOR=1", "--env", "CI=1", image, "node", "/qa/wide/full-consumer.mjs", "--inside"], { stdio: ["ignore", logfile, logfile], timeout: 2_850_000 });
    metadata.exitCode = result.status;
    metadata.signal = result.signal;
    metadata.error = result.error ? String(result.error) : undefined;
    process.exitCode = result.status === 0 ? 0 : 1;
  } finally {
    fs.closeSync(logfile);
    const state = spawnSync("docker", ["inspect", "--format", "{{index .Config.Labels \"roster.full\"}}", name], { encoding: "utf8" });
    if (state.status === 0 && state.stdout.trim() === token) spawnSync("docker", ["stop", "--time", "5", name], { timeout: 15_000 });
    metadata.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, "metadata.json"), JSON.stringify(metadata, null, 2));
    console.log(JSON.stringify(metadata));
  }
}
