import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isRankable,
  latestRuns,
  MIN_RANKED_SIGNED_N,
  parseLabResults,
  type LoadedArtifact,
} from "../src/artifact.js";
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
    delete legacy.runs[0]!.summary["signedWilsonLb"];
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

  it("mints a rank once a run crosses the signed threshold", () => {
    const ranked = syntheticRun({ signedN: 30, signedPasses: 28, signedWilsonLb: 0.812 });
    const html = renderStandings([ranked]);
    expect(html).toContain(`<td class="rk">1</td>`);
    expect(html).toContain("RANKED");
    expect(html).toContain("0.812");
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
