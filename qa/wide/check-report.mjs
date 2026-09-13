import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sha = "3f42c2d5c0648b9c3a64fbb7eadedf27dd507f1f9d6a0e8731d10fcc385895a0";
const integrity = "sha512-+Cw+KH1vdQfznx/0iGbZl62WkImkyLbz8F8sCU0Hj0Xd22bcfhPmHOUD04WABb2fzWpt9e89Lbc5fG8CC1YW1g==";
export const stages = ["image-pull", "container-start", "environment", "public-artifact", "prepare-fixture", "public-install", "installed-identity", "online-core", "remove-network", "network-membership", "offline-interfaces", "offline-core", "restore-network", "dense-enable", "dense-inference", "cleanup"];
export function validate(report, expectedProfiles) {
  assert.equal(report.package, "@npmmo/roster@0.0.2");
  assert.equal(report.candidateSha, sha);
  assert.equal(report.requestedDense, true, "full verification requires dense evidence");
  assert(report.finishedAt, "matrix did not finish");
  assert(expectedProfiles.length > 0);
  assert.deepEqual(report.profiles.map((profile) => profile.id).sort(), [...expectedProfiles].sort(), "profile inventory mismatch");
  assert.equal(new Set(report.profiles.map((profile) => profile.id)).size, expectedProfiles.length);
  for (const profile of report.profiles) {
    assert.equal(profile.status, "PASS", `${profile.id}: ${profile.status}`);
    assert(profile.finishedAt);
    assert.equal(profile.environment.platform, "linux");
    assert.equal(profile.environment.node, `v${profile.node}`);
    assert.equal(profile.environment.arch, profile.arch === "amd64" ? "x64" : "arm64");
    assert.equal(profile.environment.uid, 1000);
    if (report.host.arch === "arm64" && profile.arch === "amd64") assert.equal(profile.execution, "emulated");
    assert.match(profile.imageDigest, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(profile.steps.map((step) => step.stage).sort(), [...stages].sort(), `${profile.id}: stage inventory mismatch`);
    assert.equal(new Set(profile.steps.map((step) => step.stage)).size, stages.length);
    const rows = new Map(profile.steps.map((step) => [step.stage, step]));
    for (const [stage, step] of rows) {
      assert.equal(step.status, "PASS", `${profile.id}/${stage}: ${step.status}`);
      assert.equal(step.exitCode, 0);
      assert.equal(step.timedOut, false);
      assert(!step.spawnError && !step.validationError);
    }
    const json = (stage) => JSON.parse(rows.get(stage).stdout.trim());
    assert.equal(json("public-artifact").sha256, sha);
    assert.equal(json("installed-identity").integrity, integrity);
    assert.equal(json("installed-identity").version, "0.0.2");
    for (const stage of ["online-core", "offline-core"]) {
      const result = json(stage);
      assert.equal(result.uid, 1000);
      assert.equal(result.telemetry, "off");
      assert.equal(result.restored, true);
      assert.deepEqual(result.modes, ["transparent", "five"]);
    }
    assert.deepEqual(json("network-membership"), {});
    const interfaces = Object.values(json("offline-interfaces")).flat();
    assert(interfaces.length > 0 && interfaces.every((address) => address.internal));
    const inference = json("dense-inference");
    assert.equal(inference.dimensions, 384);
    assert(Math.abs(inference.norm - 1) < 0.001);
    assert(inference.near > inference.far);
  }
  return { profiles: report.profiles.length, stagesPerProfile: stages.length, package: report.package, sha256: sha };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const reportFile = path.resolve(process.argv[2]);
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  const result = validate(report, process.argv[3].split(","));
  const directory = path.dirname(reportFile);
  for (const profile of report.profiles) {
    for (const step of profile.steps) {
      const logfile = path.resolve(directory, step.log);
      assert(logfile.startsWith(`${directory}${path.sep}`));
      assert(fs.statSync(logfile).size > 0);
    }
  }
  console.log(JSON.stringify(result));
}
