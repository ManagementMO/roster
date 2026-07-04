import { createHash } from "node:crypto";
import os from "node:os";
import { wilsonLowerBound } from "@rosterhq/shared";
import type { SuiteRunResult } from "./runner.js";

/**
 * lab-results.json — the run artifact every public number must trace to.
 * Integrity law: summaries carry n; signed/unsigned counts stay separate so
 * unsigned results can never masquerade as certifiable coverage.
 */
export interface LabResults {
  generatedAt: string;
  environment: { node: string; platform: string; arch: string };
  /** sha256 over environment + suite versions: pins runs for reproduction. */
  environmentDigest: string;
  runs: Array<
    SuiteRunResult & {
      summary: {
        n: number;
        passes: number;
        passRate: number;
        /** Wilson over ALL tasks — internal/anonymized use. */
        wilsonLb: number;
        signedN: number;
        signedPasses: number;
        /** Wilson over human-signed tasks ONLY — the sole number that may back a NAMED public score. */
        signedWilsonLb: number;
      };
    }
  >;
}

export function buildLabResults(runs: SuiteRunResult[], now = new Date()): LabResults {
  const environment = { node: process.version, platform: os.platform(), arch: os.arch() };
  const environmentDigest = createHash("sha256")
    .update(JSON.stringify({ environment, suites: runs.map((r) => `${r.suite}@${r.suiteVersion}`) }))
    .digest("hex");
  return {
    generatedAt: now.toISOString(),
    environment,
    environmentDigest,
    runs: runs.map((run) => {
      const n = run.results.length;
      const passes = run.results.filter((r) => r.pass).length;
      const signed = run.results.filter((r) => r.signed);
      const signedPasses = signed.filter((r) => r.pass).length;
      return {
        ...run,
        summary: {
          n,
          passes,
          passRate: n > 0 ? passes / n : 0,
          wilsonLb: wilsonLowerBound(passes, n),
          signedN: signed.length,
          signedPasses,
          signedWilsonLb: wilsonLowerBound(signedPasses, signed.length),
        },
      };
    }),
  };
}
