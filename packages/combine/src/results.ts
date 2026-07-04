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
  runs: Array<
    SuiteRunResult & {
      summary: {
        n: number;
        passes: number;
        passRate: number;
        wilsonLb: number;
        signedN: number;
        signedPasses: number;
      };
    }
  >;
}

export function buildLabResults(runs: SuiteRunResult[], now = new Date()): LabResults {
  return {
    generatedAt: now.toISOString(),
    environment: { node: process.version, platform: os.platform(), arch: os.arch() },
    runs: runs.map((run) => {
      const n = run.results.length;
      const passes = run.results.filter((r) => r.pass).length;
      const signed = run.results.filter((r) => r.signed);
      return {
        ...run,
        summary: {
          n,
          passes,
          passRate: n > 0 ? passes / n : 0,
          wilsonLb: wilsonLowerBound(passes, n),
          signedN: signed.length,
          signedPasses: signed.filter((r) => r.pass).length,
        },
      };
    }),
  };
}
