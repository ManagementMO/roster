#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { assertFailProbeArtifact, parseSuite } = await import(
  pathToFileURL(path.join(repo, "packages/combine/dist/index.js")).href
);

const [suitePath, artifactPath] = process.argv.slice(2);
if (!suitePath || !artifactPath) {
  process.stderr.write(
    "usage: check-fail-probes.mjs <authoritative-suite.yaml> <lab-results.json>\n",
  );
  process.exit(2);
}

let artifact;
try {
  artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
} catch {
  process.stderr.write("fail-probe gate: artifact is not valid JSON\n");
  process.exit(1);
}

try {
  const suite = parseSuite(fs.readFileSync(suitePath, "utf8"));
  const { taskCount } = assertFailProbeArtifact(suite, artifact);
  process.stdout.write(
    `OK: all ${taskCount} fail-probes reached verification and were rejected\n`,
  );
} catch (error) {
  process.stderr.write(
    `fail-probe gate: ${error instanceof Error ? error.message : "validation failed"}\n`,
  );
  process.exit(1);
}
