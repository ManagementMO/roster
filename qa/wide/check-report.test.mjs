import assert from "node:assert/strict";
import test from "node:test";
import { stages, validate } from "./check-report.mjs";

const id = "debian-arm64-node24.20.0";
function fixture() {
  const sha = "3f42c2d5c0648b9c3a64fbb7eadedf27dd507f1f9d6a0e8731d10fcc385895a0";
  const integrity = "sha512-+Cw+KH1vdQfznx/0iGbZl62WkImkyLbz8F8sCU0Hj0Xd22bcfhPmHOUD04WABb2fzWpt9e89Lbc5fG8CC1YW1g==";
  const payloads = {
    "public-artifact": { sha256: sha },
    "installed-identity": { integrity, version: "0.0.2" },
    "online-core": { uid: 1000, telemetry: "off", restored: true, modes: ["transparent", "five"] },
    "offline-core": { uid: 1000, telemetry: "off", restored: true, modes: ["transparent", "five"] },
    "network-membership": {},
    "offline-interfaces": { lo: [{ internal: true }] },
    "dense-inference": { dimensions: 384, norm: 1, near: 0.8, far: 0.1 },
  };
  return { package: "@npmmo/roster@0.0.2", candidateSha: sha, requestedDense: true, finishedAt: "done", host: { arch: "arm64" }, profiles: [{ id, status: "PASS", finishedAt: "done", node: "24.20.0", arch: "arm64", execution: "native", imageDigest: `sha256:${"a".repeat(64)}`, environment: { platform: "linux", node: "v24.20.0", arch: "arm64", uid: 1000 }, steps: stages.map((stage) => ({ stage, status: "PASS", exitCode: 0, timedOut: false, stdout: JSON.stringify(payloads[stage] ?? {}) })) }] };
}
const row = (report, stage) => report.profiles[0].steps.find((step) => step.stage === stage);
test("accepts complete verified scope", () => assert.equal(validate(fixture(), [id]).profiles, 1));
for (const [name, mutate] of [
  ["missing profile", (report) => { report.profiles = []; }],
  ["duplicate profile", (report) => { report.profiles.push(report.profiles[0]); }],
  ["unfinished matrix", (report) => { delete report.finishedAt; }],
  ["wrong artifact", (report) => { report.candidateSha = "wrong"; }],
  ["root execution", (report) => { report.profiles[0].environment.uid = 0; }],
  ["missing stage", (report) => { report.profiles[0].steps.pop(); }],
  ["skipped inference", (report) => { row(report, "dense-inference").status = "NOT RUN"; }],
  ["timed out command", (report) => { row(report, "online-core").timedOut = true; }],
  ["disabled dense coverage", (report) => { report.requestedDense = false; }],
  ["incorrect inference", (report) => { row(report, "dense-inference").stdout = JSON.stringify({ dimensions: 384, norm: 1, near: 0.1, far: 0.8 }); }],
  ["network still attached", (report) => { row(report, "network-membership").stdout = JSON.stringify({ bridge: {} }); }],
  ["external interface present", (report) => { row(report, "offline-interfaces").stdout = JSON.stringify({ eth0: [{ internal: false }] }); }],
  ["restoration failure", (report) => { row(report, "offline-core").stdout = JSON.stringify({ uid: 1000, telemetry: "off", restored: false, modes: ["transparent", "five"] }); }],
]) {
  test(`rejects ${name}`, () => {
    const report = fixture();
    mutate(report);
    assert.throws(() => validate(report, [id]));
  });
}
