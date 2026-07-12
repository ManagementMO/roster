import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSuite, summarizeResults } from "@rosterhq/combine";
import {
  certifyRun,
  isRankable,
  latestRuns,
  MIN_RANKED_SIGNED_N,
  parseLabResults,
  suiteKey,
  withoutSignedCredit,
  type LoadedArtifact,
  type SuiteSigning,
} from "../src/artifact.js";
import { buildSite } from "../src/build.js";
import { renderBoxScore, renderStandings } from "../src/pages.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const verificationDir = path.join(repoRoot, "docs", "verification");

/** The real committed artifact — the site is tested against production data, not fixtures. */
function realArtifact(): LoadedArtifact {
  const name = fs
    .readdirSync(verificationDir)
    .filter((f) => f.endsWith("lab-results.json"))
    .sort()
    .at(-1);
  if (!name) throw new Error("no lab-results artifact committed under docs/verification");
  const file = path.join(verificationDir, name);
  return { path: file, data: parseLabResults(fs.readFileSync(file, "utf8"), file) };
}

const syntheticRun = (over: Partial<LoadedArtifact["data"]["runs"][number]["summary"]>) => {
  const real = realArtifact();
  const base = real.data.runs[0]!;
  return {
    artifact: real,
    run: { ...base, server: "synthetic", suite: "synthetic-suite", summary: { ...base.summary, ...over } },
  };
};

/**
 * A run that has genuinely EARNED a rank: 30 real signed rows, 28 passing, and a
 * summary derived from them. The old fixture minted a rank by editing only the
 * summary — i.e. it encoded the very forgery R5-03 exploited, so it could never
 * have caught it. A fixture that cannot be built honestly is a bug in the test.
 */
const rankedRun = () => {
  const real = realArtifact();
  const base = real.data.runs[0]!;
  const seed = base.results[0]!;
  const results = Array.from({ length: MIN_RANKED_SIGNED_N }, (_, i) => ({
    ...seed,
    taskId: `signed-${i}`,
    signed: true,
    pass: i < 28,
    latencyMs: 5,
  }));
  return {
    artifact: real,
    run: { ...base, server: "synthetic", suite: "synthetic-suite", results, summary: summarizeResults(results) },
  };
};

/** The authoritative signing map, straight from the real committed suite. */
function realSigning(): SuiteSigning {
  const suite = parseSuite(fs.readFileSync(path.join(repoRoot, "suites", "filesystem", "tasks.yaml"), "utf8"));
  return new Map([[suiteKey(suite.suite, suite.version), new Map(suite.tasks.map((t) => [t.id, t.signed]))]]);
}

/** Rebuild an artifact's single run from rows, with a summary that matches them. */
function artifactWithRows(rows: Array<Record<string, unknown>>, server = "forged"): string {
  const { data } = realArtifact();
  const a = structuredClone(data) as unknown as {
    runs: Array<Record<string, unknown>>;
  };
  a.runs[0]!.server = server;
  a.runs[0]!.results = rows;
  a.runs[0]!.summary = summarizeResults(rows as never);
  return JSON.stringify(a);
}

describe("artifact loading (honesty gate)", () => {
  it("parses the real committed artifact", () => {
    const { data } = realArtifact();
    expect(data.runs.length).toBeGreaterThan(0);
    expect(typeof data.environmentDigest).toBe("string");
    expect(typeof data.runs[0]!.summary.signedWilsonLb).toBe("number");
  });

  it("rejects legacy artifacts missing signedWilsonLb instead of coercing", () => {
    const { data } = realArtifact();
    const legacy = structuredClone(data) as { runs: Array<{ summary: Record<string, unknown> }> };
    delete legacy.runs[0]!.summary.signedWilsonLb;
    expect(() => parseLabResults(JSON.stringify(legacy), "old.json")).toThrow(/legacy artifact/);
  });

  it("keeps only the newest run per (server, suite)", () => {
    const a = realArtifact();
    const older = structuredClone(a.data);
    older.generatedAt = "2000-01-01T00:00:00.000Z";
    older.runs[0]!.summary.passes = 0;
    const merged = latestRuns([{ path: "old.json", data: older }, a]);
    expect(merged).toHaveLength(a.data.runs.length);
    expect(merged[0]!.run.summary.passes).toBe(a.data.runs[0]!.summary.passes);
  });
});

describe("methodology enforced in the renderer", () => {
  it(`never mints a rank below ${MIN_RANKED_SIGNED_N} signed tasks`, () => {
    expect(isRankable(syntheticRun({ signedN: MIN_RANKED_SIGNED_N - 1 }).run)).toBe(false);
    expect(isRankable(syntheticRun({ signedN: MIN_RANKED_SIGNED_N }).run)).toBe(true);
  });

  it("renders the real (unsigned) run rank-less, in pre-season, with n visible", () => {
    const real = realArtifact();
    const entries = real.data.runs.map((run) => ({ artifact: real, run }));
    const html = renderStandings(entries);
    expect(html).toContain("PRE-SEASON");
    expect(html).toContain(`<td class="rk">—</td>`);
    expect(html).not.toContain(`<td class="rk">1</td>`);
    const s = real.data.runs[0]!.summary;
    expect(html).toContain(`${s.signedN}/${s.n}`);
    expect(html).toContain(s.wilsonLb.toFixed(3));
  });

  it("mints a rank once a run crosses the signed threshold (rows earn it, not a summary)", () => {
    const ranked = rankedRun();
    const html = renderStandings([ranked]);
    expect(html).toContain(`<td class="rk medal">1</td>`);
    expect(html).toContain("RANKED");
    expect(html).toContain(ranked.run.summary.signedWilsonLb.toFixed(3)); // derived from 28/30 signed rows
    expect(html).not.toContain("PRE-SEASON</span>");
  });

  it("box score carries record, LB, provenance strip, digest, and methodology tag", () => {
    const real = realArtifact();
    const run = real.data.runs[0]!;
    const html = renderBoxScore({ artifact: real, run }, new Map([[run.results[0]!.taskId, "desc here"]]));
    const s = run.summary;
    expect(html).toContain(`${s.passes}–${s.n - s.passes}`);
    expect(html).toContain(s.wilsonLb.toFixed(3));
    expect(html).toContain(real.data.environmentDigest.slice(0, 12));
    expect(html).toContain(`v${run.suiteVersion}`);
    expect(html).toContain("methodology");
    if (s.signedN === 0) expect(html).toContain("UNSIGNED RUN");
  });

  it("escapes hostile server names", () => {
    const evil = syntheticRun({});
    evil.run.server = `<script>alert(1)</script>`;
    const html = renderStandings([evil]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

/**
 * The public-score law: a NAMED score may rest only on actual human-signed task
 * rows. Round 5 (R5-03) minted an "official" rank #1 from an artifact whose every
 * row was `signed: false`. These lock both halves of the gate: the summary is
 * DERIVED from the rows, and the rows' `signed` flags are bound to the SUITE.
 */
describe("public-score integrity (R5-03 / R5-10)", () => {
  const unsignedRow = (i: number) => ({
    taskId: `u-${i}`,
    signed: false,
    pass: true,
    stage: null,
    detail: null,
    latencyMs: 5,
  });

  it("rejects a forged summary that claims signed coverage its rows do not have", () => {
    const { data } = realArtifact();
    const a = structuredClone(data) as unknown as { runs: Array<Record<string, unknown>> };
    a.runs[0]!.results = Array.from({ length: 30 }, (_, i) => unsignedRow(i));
    a.runs[0]!.summary = { n: 30, passes: 30, passRate: 1, wilsonLb: 0.886, signedN: 30, signedPasses: 30, signedWilsonLb: 0.886 };
    expect(() => parseLabResults(JSON.stringify(a), "forged.json")).toThrow(/summary does not match its task rows/);
  });

  it("returns the DERIVED summary, never the file's claim (even within float tolerance)", () => {
    // A claim nudged by less than the comparison tolerance is ACCEPTED — and must
    // still be discarded in favour of the recomputed value. Otherwise the file's
    // number, not the rows', is what reaches the page.
    const rows = Array.from({ length: 4 }, (_, i) => ({ ...unsignedRow(i), pass: i < 3 }));
    const a = JSON.parse(artifactWithRows(rows)) as { runs: Array<{ summary: Record<string, number> }> };
    const exact = summarizeResults(rows as never);
    a.runs[0]!.summary.wilsonLb = exact.wilsonLb + 1e-12; // inside tolerance, so it parses
    const parsed = parseLabResults(JSON.stringify(a), "nudged.json");
    expect(parsed.runs[0]!.summary.wilsonLb).toBe(exact.wilsonLb); // the ROWS' number, not the file's
    expect(parsed.runs[0]!.summary.wilsonLb).not.toBe(exact.wilsonLb + 1e-12);
  });

  it("rejects duplicate task ids (a replayed signed row is not 30 tasks)", () => {
    const rows = Array.from({ length: 30 }, () => unsignedRow(1)); // same id 30x
    expect(() => parseLabResults(artifactWithRows(rows), "dup.json")).toThrow(/repeats task id/);
  });

  it("rejects a non-numeric latencyMs — the field that rendered raw into HTML", () => {
    const rows = [{ ...unsignedRow(0), latencyMs: '<img src=x onerror="globalThis.pwned=1">' }];
    expect(() => parseLabResults(artifactWithRows(rows as never), "xss.json")).toThrow(/non-numeric latencyMs/);
  });

  it("box score escapes latencyMs even if a caller hands it markup directly", () => {
    const real = realArtifact();
    const run = structuredClone(real.data.runs[0]!);
    (run.results[0] as unknown as { latencyMs: unknown }).latencyMs = `<script>alert(1)</script>`;
    const html = renderBoxScore({ artifact: real, run }, new Map());
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("CERTIFICATION: a self-consistent artifact that merely FLIPS signed=true is tampering", () => {
    // The sophisticated forgery: real task ids, a summary correctly derived from
    // the rows (so the parser has nothing to catch) — only the signing lies.
    const suite = parseSuite(fs.readFileSync(path.join(repoRoot, "suites", "filesystem", "tasks.yaml"), "utf8"));
    const rows = suite.tasks.map((t) => ({ ...unsignedRow(0), taskId: t.id, signed: true }));
    const parsed = parseLabResults(artifactWithRows(rows), "flipped.json");
    expect(parsed.runs[0]!.summary.signedN).toBe(suite.tasks.length); // parser accepts: internally consistent
    const cert = certifyRun(parsed.runs[0]!, realSigning());
    expect(cert.status).toBe("tampered"); // the SUITE is the authority
    expect(cert.status === "tampered" && cert.reason).toMatch(/says signed=false/);
  });

  it("CERTIFICATION: dropping tasks (forgery by omission) is tampering", () => {
    const suite = parseSuite(fs.readFileSync(path.join(repoRoot, "suites", "filesystem", "tasks.yaml"), "utf8"));
    const rows = suite.tasks.slice(0, 4).map((t) => ({ ...unsignedRow(0), taskId: t.id }));
    const parsed = parseLabResults(artifactWithRows(rows), "partial.json");
    const cert = certifyRun(parsed.runs[0]!, realSigning());
    expect(cert.status).toBe("tampered");
    expect(cert.status === "tampered" && cert.reason).toMatch(/partial run cannot be scored/);
  });

  it("CERTIFICATION: without the suite a run is unverifiable — shown, never ranked", () => {
    const ranked = rankedRun().run;
    expect(isRankable(ranked)).toBe(true);
    const cert = certifyRun(ranked, new Map()); // no suites available
    expect(cert.status).toBe("unverifiable");
    expect(isRankable(withoutSignedCredit(ranked))).toBe(false); // fail-closed
  });

  it("the real committed artifact still parses AND certifies against its real suite", () => {
    const { data } = realArtifact();
    expect(certifyRun(data.runs[0]!, realSigning()).status).toBe("certified");
    expect(data.runs[0]!.summary.signedN).toBe(0); // honest: nothing is signed yet
  });

  it("END-TO-END: buildSite refuses to render a tampered artifact at all", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "league-test-"));
    try {
      const artifactsDir = path.join(dir, "artifacts");
      fs.mkdirSync(artifactsDir);
      const suite = parseSuite(fs.readFileSync(path.join(repoRoot, "suites", "filesystem", "tasks.yaml"), "utf8"));
      const rows = suite.tasks.map((t) => ({ ...unsignedRow(0), taskId: t.id, signed: true }));
      fs.writeFileSync(path.join(artifactsDir, "forged-lab-results.json"), artifactWithRows(rows, "forged-server"));

      const report = buildSite({
        artifactsDir,
        suitesDir: path.join(repoRoot, "suites"),
        outDir: path.join(dir, "site"),
      });

      const html = fs.readFileSync(path.join(dir, "site", "index.html"), "utf8");
      expect(html).not.toContain("forged-server");
      expect(html).not.toContain(`<td class="rk medal">1</td>`);
      expect(report.skipped.map((s) => s.reason).join(" ")).toMatch(/says signed=false/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
