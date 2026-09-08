import type { Suite } from "./task.js";

export interface FailProbeAudit {
  taskCount: number;
}

/**
 * Proves that a fail-probe run exercised the verifiers themselves.
 *
 * Merely observing zero passes is insufficient: a dead target, connect
 * failure, or invocation error also produces zero passes and would turn a
 * broken certification environment into a false-green gate.
 */
export function assertFailProbeArtifact(
  suite: Suite,
  artifact: unknown,
): FailProbeAudit {
  if (suite.tasks.some((task) => task.signed)) {
    throw new Error("fail-probe suite tasks must be unsigned");
  }
  if (!isRecord(artifact) || !Array.isArray(artifact.runs) || artifact.runs.length !== 1) {
    throw new Error("fail-probe artifact must contain exactly one run");
  }

  const run = artifact.runs[0];
  if (
    !isRecord(run) ||
    run.suite !== suite.suite ||
    run.suiteVersion !== suite.version ||
    run.category !== suite.category
  ) {
    throw new Error("fail-probe artifact does not match the authoritative suite");
  }
  if (!Array.isArray(run.results) || run.results.length !== suite.tasks.length) {
    throw new Error("fail-probe artifact lacks complete authoritative task coverage");
  }

  for (const [index, task] of suite.tasks.entries()) {
    const result = run.results[index];
    if (!isRecord(result) || result.taskId !== task.id) {
      throw new Error(
        `fail-probe result order does not match the expected task at index ${index}`,
      );
    }
    if (result.signed !== false) {
      throw new Error(`fail-probe ${task.id} must remain unsigned`);
    }
    if (result.pass !== false) {
      throw new Error(`fail-probe ${task.id} unexpectedly passed`);
    }
    if (result.stage !== "verify") {
      throw new Error(
        `fail-probe ${task.id} must fail at verify, not ${safeStage(result.stage)}`,
      );
    }
  }

  if (
    !isRecord(run.summary) ||
    run.summary.n !== suite.tasks.length ||
    run.summary.passes !== 0 ||
    run.summary.signedN !== 0
  ) {
    throw new Error("fail-probe summary does not match its verified unsigned task rows");
  }

  return { taskCount: suite.tasks.length };
}

function safeStage(value: unknown): string {
  if (value === "transport" || value === "invoke" || value === "verify") {
    return value;
  }
  return value === null ? "no stage" : "an invalid stage";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
