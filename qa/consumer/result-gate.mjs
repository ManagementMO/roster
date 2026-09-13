import fs from "node:fs";

const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const expected = [
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
const allowedSkips = new Set(["INST-version-upgrade", "NET-offline-namespace"]);
if (report.env?.platform === "win32") allowedSkips.add("NET-telemetry-off-strace");
if (!report.env?.finishedAt || !Array.isArray(report.results)) throw new Error("consumer run did not finish");
if (!process.env.CANDIDATE_SHA256 || report.env.tarballSha256 !== process.env.CANDIDATE_SHA256) throw new Error("candidate identity mismatch");
const rows = new Map(report.results.map((result) => [result.id, result]));
if (rows.size !== expected.length || report.results.length !== expected.length) throw new Error("consumer case inventory differs from the required matrix");
const failures = expected.filter((id) => {
  const result = rows.get(id);
  return !result || result.artifact?.package !== "@npmmo/roster@0.0.1" ||
    result.artifact?.tarballSha256 !== process.env.CANDIDATE_SHA256 ||
    (result.status !== "PASS" && !(result.status === "NOT RUN" && allowedSkips.has(id)));
});
if (failures.length) throw new Error(`consumer acceptance failed or was blocked: ${failures.join(", ")}`);
const skipped = report.results.filter((result) => result.status === "NOT RUN").map((result) => result.id);
console.log(`Consumer evidence complete: ${report.results.length - skipped.length} PASS; explicitly NOT RUN: ${skipped.join(", ") || "none"}`);
