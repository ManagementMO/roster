import { summarizeResults, type LabResults, type RunSummary, type TaskResult } from "@rosterhq/combine";

/** methodology.md §1: no ranked placement below this many signed tasks. */
export const MIN_RANKED_SIGNED_N = 30;

export const METHODOLOGY_VERSION = "v0.1";

export type LeagueRun = LabResults["runs"][number];

export interface LoadedArtifact {
  path: string;
  data: LabResults;
}

export const isRankable = (run: LeagueRun): boolean => run.summary.signedN >= MIN_RANKED_SIGNED_N;
export const isPreSeason = (run: LeagueRun): boolean => run.summary.signedN === 0;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const STAGES = new Set(["invoke", "verify", "transport"]);

/** Counts must match exactly; the Wilson floats only within representation noise. */
const sameNumber = (a: number, b: number): boolean => Object.is(a, b) || Math.abs(a - b) <= 1e-9;

const sameSummary = (claimed: RunSummary, derived: RunSummary): boolean =>
  (["n", "passes", "signedN", "signedPasses"] as const).every((k) => claimed[k] === derived[k]) &&
  (["passRate", "wilsonLb", "signedWilsonLb"] as const).every((k) => sameNumber(claimed[k], derived[k]));

/**
 * The artifact boundary is an INTEGRITY gate, not a shape check.
 *
 * A `summary` in a file is a CLAIM; the task rows are the evidence. Round 5
 * (R5-03) fed this parser 30 rows that were every one of them `signed: false`,
 * alongside a summary asserting 30 signed passes — and the League ranked it as
 * an "official — certified tasks only" score. The old code only checked that
 * the summary's fields were *numbers*.
 *
 * So: every row is type-checked (a non-number `latencyMs` was also an HTML
 * injection vector, R5-10), task ids must be unique, and the summary is
 * RE-DERIVED from the rows with the Combine's own `summarizeResults` — the same
 * function that wrote it. Any disagreement is a rejection, and the derived
 * summary (never the file's) is what leaves this function.
 *
 * This alone does not make a signed score trustworthy — a forger can still set
 * `signed: true` on the rows themselves. That claim is bound to the authoritative
 * suite in `certifyRun`; the two gates are meant to be used together.
 */
export function parseLabResults(raw: string, path = "lab-results.json"): LabResults {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path}: not valid JSON (${(err as Error).message})`);
  }
  const fail = (why: string): never => {
    throw new Error(`${path}: ${why} — legacy artifact? regenerate with \`roster combine run\``);
  };
  if (!isRecord(json)) return fail("artifact is not an object");
  if (typeof json.generatedAt !== "string") return fail("missing generatedAt");
  if (typeof json.environmentDigest !== "string") return fail("missing environmentDigest");
  if (!isRecord(json.environment) || typeof json.environment.node !== "string") return fail("missing environment");
  if (!Array.isArray(json.runs) || json.runs.length === 0) return fail("missing runs");
  for (const run of json.runs) {
    if (!isRecord(run)) return fail("run is not an object");
    for (const key of ["server", "suite", "suiteVersion", "category"] as const) {
      if (typeof run[key] !== "string") return fail(`run missing ${key}`);
    }
    const where = `run "${String(run.server)}"`;
    if (!Array.isArray(run.results)) return fail(`${where} missing results`);
    const summary = run.summary;
    if (!isRecord(summary)) return fail(`${where} missing summary`);
    for (const key of ["n", "passes", "passRate", "wilsonLb", "signedN", "signedPasses", "signedWilsonLb"] as const) {
      if (!isFiniteNumber(summary[key])) return fail(`${where} summary missing ${key}`);
    }

    // Every ROW, strictly: these are the only facts a public score may rest on.
    const seen = new Set<string>();
    for (const r of run.results) {
      if (!isRecord(r)) return fail(`${where} has a non-object task row`);
      if (typeof r.taskId !== "string" || r.taskId === "") return fail(`${where} has a task row without a taskId`);
      if (seen.has(r.taskId)) return fail(`${where} repeats task id "${r.taskId}"`);
      seen.add(r.taskId);
      if (typeof r.signed !== "boolean") return fail(`${where} task "${r.taskId}" has a non-boolean signed flag`);
      if (typeof r.pass !== "boolean") return fail(`${where} task "${r.taskId}" has a non-boolean pass flag`);
      if (r.stage !== null && !(typeof r.stage === "string" && STAGES.has(r.stage))) {
        return fail(`${where} task "${r.taskId}" has an unknown stage`);
      }
      if (r.detail !== null && typeof r.detail !== "string") {
        return fail(`${where} task "${r.taskId}" has a non-string detail`);
      }
      if (!isFiniteNumber(r.latencyMs) || r.latencyMs < 0) {
        return fail(`${where} task "${r.taskId}" has a non-numeric latencyMs`);
      }
    }

    // Derive, don't trust. The rows are the evidence; the summary must equal them.
    const derived = summarizeResults(run.results as unknown as TaskResult[]);
    if (!sameSummary(summary as unknown as RunSummary, derived)) {
      return fail(
        `${where} summary does not match its task rows ` +
          `(claims ${summary.signedPasses}/${summary.signedN} signed, rows show ${derived.signedPasses}/${derived.signedN})`,
      );
    }
    run.summary = derived; // the derived summary is the only one that leaves here
  }
  return json as unknown as LabResults;
}

/* ------------------------------------------------------------------ *
 * Certification: binding a run's `signed` flags to the authoritative suite
 * ------------------------------------------------------------------ */

export interface SuiteTaskAuthority {
  signed: boolean;
  description?: string;
}

/** Authoritative identity and task facts loaded from one reviewed suite file. */
export interface SuiteAuthority {
  category: string;
  tasks: ReadonlyMap<string, SuiteTaskAuthority>;
}

/** Collision-free tuple key for a suite and version. */
export const suiteKey = (suite: string, version: string): string =>
  JSON.stringify([suite, version]);

export type Certification =
  | { status: "certified" }
  | { status: "unverifiable"; reason: string }
  | { status: "tampered"; reason: string };

/**
 * A row's `signed: true` is a COPY of the suite's `task.signed` — so on its own
 * it is an unverified assertion by whoever wrote the file. The suite in
 * `suites/` is the authority (it is reviewed, versioned, and in the repo); the
 * artifact is not. This re-checks each row against it.
 *
 * Fail-closed, three ways:
 *  - rows contradict a suite we HAVE  → `tampered` (the artifact is dropped);
 *  - suite/version absent             → `unverifiable` (rendered, but stripped of
 *    signed credit — it may still be shown, it may never rank);
 *  - the row set isn't the suite's task set → also tampering: the methodology
 *    promises "the identical task suite", and dropping a failing signed row is
 *    how you'd forge a score by OMISSION rather than by assertion.
 */
export function certifyRun(
  run: LeagueRun,
  authorities: ReadonlyMap<string, SuiteAuthority>,
): Certification {
  const key = suiteKey(run.suite, run.suiteVersion);
  const authority = authorities.get(key);
  if (!authority) {
    return { status: "unverifiable", reason: `no suite ${key} available to certify against` };
  }
  if (run.category !== authority.category) {
    return {
      status: "tampered",
      reason: `run category "${run.category}" contradicts suite ${key}'s authoritative category "${authority.category}"`,
    };
  }
  for (const r of run.results) {
    const authoritative = authority.tasks.get(r.taskId);
    if (authoritative === undefined) {
      return { status: "tampered", reason: `task "${r.taskId}" is not in suite ${key}` };
    }
    if (r.signed !== authoritative.signed) {
      return {
        status: "tampered",
        reason: `task "${r.taskId}" claims signed=${r.signed} but suite ${key} says signed=${authoritative.signed}`,
      };
    }
  }
  if (run.results.length !== authority.tasks.size) {
    return {
      status: "tampered",
      reason: `ran ${run.results.length} of suite ${key}'s ${authority.tasks.size} tasks — a partial run cannot be scored`,
    };
  }
  return { status: "certified" };
}

/**
 * Strip signed credit from a run we cannot certify. It stays visible (the
 * results are still real and reproducible) but reads as PRE-SEASON/unofficial
 * and can never mint a named rank.
 */
export function withoutSignedCredit(run: LeagueRun): LeagueRun {
  return { ...run, summary: { ...run.summary, signedN: 0, signedPasses: 0, signedWilsonLb: 0 } };
}

/** Newest artifact wins per exact (server, suite, suiteVersion) tuple. */
export function latestRuns(artifacts: LoadedArtifact[]): Array<{ artifact: LoadedArtifact; run: LeagueRun }> {
  const byKey = new Map<string, { artifact: LoadedArtifact; run: LeagueRun }>();
  const sorted = [...artifacts].sort((a, b) => a.data.generatedAt.localeCompare(b.data.generatedAt));
  for (const artifact of sorted) {
    for (const run of artifact.data.runs) {
      byKey.set(
        JSON.stringify([run.server, run.suite, run.suiteVersion]),
        { artifact, run },
      );
    }
  }
  return [...byKey.values()];
}
