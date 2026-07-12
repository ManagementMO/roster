import { createHash } from "node:crypto";
import os from "node:os";
import { wilsonLowerBound } from "@rosterhq/shared";
import type { SuiteRunResult, TaskResult } from "./runner.js";

export interface RunSummary {
  n: number;
  passes: number;
  passRate: number;
  /** Wilson over ALL tasks — internal/anonymized use. */
  wilsonLb: number;
  signedN: number;
  signedPasses: number;
  /** Wilson over human-signed tasks ONLY — the sole number that may back a NAMED public score. */
  signedWilsonLb: number;
}

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
  runs: Array<SuiteRunResult & { summary: RunSummary }>;
}

/**
 * The ONE place a run summary is computed — and therefore the one place it can
 * be RE-derived. A `summary` sitting in an artifact file is a CLAIM, never
 * evidence: the League re-runs this exact function over the task rows and
 * refuses to render a score that the rows don't produce. Round 5 (R5-03) landed
 * a forged artifact whose rows were all `signed: false` while its summary
 * claimed 30 signed passes — it was accepted and ranked. Keeping the math in a
 * single exported function is what makes "derive, don't trust" cheap enough to
 * actually do at every boundary.
 */
export function summarizeResults(results: TaskResult[]): RunSummary {
  const n = results.length;
  const passes = results.filter((r) => r.pass).length;
  const signed = results.filter((r) => r.signed);
  const signedPasses = signed.filter((r) => r.pass).length;
  return {
    n,
    passes,
    passRate: n > 0 ? passes / n : 0,
    wilsonLb: wilsonLowerBound(passes, n),
    signedN: signed.length,
    signedPasses,
    signedWilsonLb: wilsonLowerBound(signedPasses, signed.length),
  };
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
    runs: runs.map((run) => ({ ...run, summary: summarizeResults(run.results) })),
  };
}
