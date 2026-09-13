import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ids = [
  "SETUP-pinned-backends", "REG-public-availability", "REG-staging-parity",
  "INST-local-tarball", "INST-local-registry", "INST-global-prefix", "INST-unicode-paths",
  "INST-path-shadowing", "INST-reinstall-moved-prefix", "INST-npx-ephemeral", "INST-npx-sync-journey",
  "INST-version-upgrade", "FN-help", "FN-init-no-dense", "FN-init-non-tty", "FN-receipt",
  "FN-telemetry", "FN-sync-eject-dedicated-files", "FN-sync-eject-state-files", "FN-malformed-selectors",
  "FN-unsupported-controls-refused", "FN-serve-transparent", "FN-serve-five",
  "FN-drift-quarantine-unquarantine", "FN-lifecycle-restart-cancel-uncooperative",
  "FN-lifecycle-uncooperative-descendant", "FN-combine-filesystem", "FN-combine-fail-probes",
  "FN-dense-status-enable-provenance", "FN-dense-minilm-inference", "FN-dense-product-path",
  "NET-telemetry-off-strace", "NET-offline-namespace",
];
const sha = "a".repeat(64);
const gate = fileURLToPath(new URL("./result-gate.mjs", import.meta.url));
const fixture = () => ({
  env: { platform: "linux", finishedAt: "2026-09-13T00:00:00.000Z", tarballSha256: sha },
  results: ids.map((id) => ({ id, status: id === "INST-version-upgrade" ? "NOT RUN" : "PASS", artifact: { package: "@npmmo/roster@0.0.1", tarballSha256: sha } })),
});
function run(report) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-evidence-gate-"));
  try {
    const file = path.join(dir, "results.json");
    fs.writeFileSync(file, JSON.stringify(report));
    return spawnSync(process.execPath, [gate, file], { encoding: "utf8", env: { ...process.env, CANDIDATE_SHA256: sha } });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("accepts complete evidence and explicitly allowed unverified checks", () => {
  const report = fixture();
  report.results.find((row) => row.id === "NET-offline-namespace").status = "NOT RUN";
  const result = run(report);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /explicitly NOT RUN: INST-version-upgrade, NET-offline-namespace/);
});
for (const status of ["FAIL", "BLOCKED", "NOT RUN"]) {
  test(`rejects a required case marked ${status}`, () => {
    const report = fixture();
    report.results.find((row) => row.id === "FN-help").status = status;
    assert.notEqual(run(report).status, 0);
  });
}
for (const [name, mutate] of [
  ["missing case", (report) => report.results.pop()],
  ["unfinished run", (report) => delete report.env.finishedAt],
  ["wrong candidate", (report) => { report.env.tarballSha256 = "b".repeat(64); }],
  ["wrong case artifact", (report) => { report.results[0].artifact.tarballSha256 = "b".repeat(64); }],
]) {
  test(`rejects ${name}`, () => {
    const report = fixture();
    mutate(report);
    assert.notEqual(run(report).status, 0);
  });
}
