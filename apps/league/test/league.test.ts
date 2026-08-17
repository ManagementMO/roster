import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSuite, summarizeResults } from "@roster/combine";
import {
  certifyRun,
  isRankable,
  latestRuns,
  MIN_RANKED_SIGNED_N,
  parseLabResults,
  suiteKey,
  withoutSignedCredit,
  type LoadedArtifact,
  type SuiteAuthority,
} from "../src/artifact.js";
import { buildSite, loadSuites } from "../src/build.js";
import {
  boxScoreFilename,
  renderBoxScore,
  renderStandings,
} from "../src/pages.js";

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

/** The authoritative suite map, straight from the real committed suite. */
function realAuthorities(): ReadonlyMap<string, SuiteAuthority> {
  const suite = parseSuite(fs.readFileSync(path.join(repoRoot, "suites", "filesystem", "tasks.yaml"), "utf8"));
  return new Map([
    [
      suiteKey(suite.suite, suite.version),
      {
        category: suite.category,
        tasks: new Map(
          suite.tasks.map((task) => [
            task.id,
            { signed: task.signed, description: task.description },
          ]),
        ),
      },
    ],
  ]);
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
    const legacy = structuredClone(data) as unknown as { runs: Array<{ summary: Record<string, unknown> }> };
    delete legacy.runs[0]!.summary.signedWilsonLb;
    expect(() => parseLabResults(JSON.stringify(legacy), "old.json")).toThrow(/legacy artifact/);
  });

  it.each([
    ["missing platform", (data: Record<string, unknown>) => {
      delete (data.environment as Record<string, unknown>).platform;
    }],
    ["missing arch", (data: Record<string, unknown>) => {
      delete (data.environment as Record<string, unknown>).arch;
    }],
    ["invalid date", (data: Record<string, unknown>) => {
      data.generatedAt = "not-a-date";
    }],
    ["noncanonical date", (data: Record<string, unknown>) => {
      data.generatedAt = "2026-07-05T01:05:26.314+00:00";
    }],
    ["invalid digest", (data: Record<string, unknown>) => {
      data.environmentDigest = "not-a-sha256";
    }],
    ["empty server identity", (data: Record<string, unknown>) => {
      ((data.runs as Array<Record<string, unknown>>)[0]!).server = "";
    }],
  ])("rejects strict metadata: %s", (_name, mutate) => {
    const data = structuredClone(realArtifact().data) as unknown as Record<
      string,
      unknown
    >;
    mutate(data);
    expect(() => parseLabResults(JSON.stringify(data), "strict.json")).toThrow();
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

  it("keeps separator-colliding server/suite tuples as distinct identities", () => {
    const artifact = realArtifact();
    const base = artifact.data.runs[0]!;
    const first = { ...base, server: "A", suite: "B C" };
    const second = { ...base, server: "A B", suite: "C" };
    const data = { ...artifact.data, runs: [first, second] };

    expect(latestRuns([{ ...artifact, data }])).toHaveLength(2);
    expect(suiteKey("A@B", "C")).not.toBe(suiteKey("A", "B@C"));
  });
});

describe("methodology enforced in the renderer", () => {
  it("does not claim target-level reproducibility from a runtime-only digest", () => {
    const artifact = realArtifact();
    const entry = { artifact, run: artifact.data.runs[0]! };

    expect(renderStandings([entry])).not.toMatch(/\breproducible\b/i);
    expect(renderBoxScore(entry, new Map())).not.toMatch(/\breproducible\b/i);
  });

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

  it("ranks different suite versions in separate identical-suite tables", () => {
    const first = rankedRun();
    first.run.server = "server-one";
    first.run.suite = "suite-one";
    first.run.suiteVersion = "1";
    first.run.category = "filesystem";
    const second = structuredClone(first);
    second.run.server = "server-two";
    second.run.suiteVersion = "2";

    const html = renderStandings([first, second]);
    expect(html.match(/<td class="rk medal">1<\/td>/g)).toHaveLength(2);
    expect(html).toContain("suite-one v1");
    expect(html).toContain("suite-one v2");
  });

  it("gives lossy names and suite versions collision-resistant box-score files", () => {
    const first = rankedRun().run;
    first.server = "same/name";
    first.suite = "same suite";
    first.suiteVersion = "1";
    const second = structuredClone(first);
    second.server = "same-name";
    const third = structuredClone(first);
    third.suiteVersion = "2";

    expect(boxScoreFilename(first)).not.toBe(boxScoreFilename(second));
    expect(boxScoreFilename(first)).not.toBe(boxScoreFilename(third));
    expect(boxScoreFilename(first)).toMatch(/[a-f0-9]{64}\.html$/);
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
    const cert = certifyRun(parsed.runs[0]!, realAuthorities());
    expect(cert.status).toBe("tampered"); // the SUITE is the authority
    expect(cert.status === "tampered" && cert.reason).toMatch(/says signed=false/);
  });

  it("CERTIFICATION: dropping tasks (forgery by omission) is tampering", () => {
    const suite = parseSuite(fs.readFileSync(path.join(repoRoot, "suites", "filesystem", "tasks.yaml"), "utf8"));
    const rows = suite.tasks.slice(0, 4).map((t) => ({ ...unsignedRow(0), taskId: t.id }));
    const parsed = parseLabResults(artifactWithRows(rows), "partial.json");
    const cert = certifyRun(parsed.runs[0]!, realAuthorities());
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

  it("CERTIFICATION: a forged category contradicting the suite is tampering", () => {
    const { data } = realArtifact();
    const forged = { ...data.runs[0]!, category: "forged-category" };
    const cert = certifyRun(forged, realAuthorities());
    expect(cert.status).toBe("tampered");
    expect(cert.status === "tampered" && cert.reason).toMatch(/category/i);
  });

  it("the real committed artifact still parses AND certifies against its real suite", () => {
    const { data } = realArtifact();
    expect(certifyRun(data.runs[0]!, realAuthorities()).status).toBe("certified");
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
        allowEmpty: true,
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

describe("suite authority is unambiguous and fail-closed (L9)", () => {
  const suiteYaml = (over: { suite?: string; version?: string; category?: string; signed?: boolean }) => `
suite: ${over.suite ?? "dup"}
version: "${over.version ?? "1.0.0"}"
category: ${over.category ?? "filesystem"}
tasks:
  - id: t1
    signed: ${over.signed ?? false}
    invoke: { tool: write_file, args: { path: "a.txt", content: "x" } }
    verify:
      - { kind: fileExists, path: "a.txt" }
`;
  const writeSuiteDir = (root: string, dirName: string, yaml: string) => {
    const d = path.join(root, dirName);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "tasks.yaml"), yaml);
  };
  const withSuitesDir = (fn: (dir: string) => void) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "league-suites-"));
    try {
      fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("loads a unique (suite,version) as authoritative", () => {
    withSuitesDir((dir) => {
      writeSuiteDir(dir, "only", suiteYaml({ suite: "solo", version: "2.0.0" }));
      expect(loadSuites(dir).authorities.has(suiteKey("solo", "2.0.0"))).toBe(true);
    });
  });

  it("poisons a (suite,version) duplicated across suite dirs — never silently authoritative", () => {
    withSuitesDir((dir) => {
      // Two dirs claim the SAME (suite, version) but disagree on signed credit.
      // Silent last-writer-wins would let one copy MINT (signed:true) or STRIP
      // credit depending on load order; fail-closed drops the key entirely so
      // every run against it is unverifiable (shown, never ranked).
      writeSuiteDir(dir, "a-unsigned", suiteYaml({ signed: false }));
      writeSuiteDir(dir, "b-signed", suiteYaml({ signed: true }));
      expect(loadSuites(dir).authorities.has(suiteKey("dup", "1.0.0"))).toBe(false);
    });
  });

  it("keeps distinct versions of the same suite name (does not over-poison)", () => {
    withSuitesDir((dir) => {
      writeSuiteDir(dir, "v1", suiteYaml({ suite: "shared", version: "1.0.0" }));
      writeSuiteDir(dir, "v2", suiteYaml({ suite: "shared", version: "2.0.0" }));
      const { authorities } = loadSuites(dir);
      expect(authorities.has(suiteKey("shared", "1.0.0"))).toBe(true);
      expect(authorities.has(suiteKey("shared", "2.0.0"))).toBe(true);
    });
  });
});

describe("strict atomic site publication", () => {
  function writeRunArtifact(
    artifactsDir: string,
    name: string,
    server: string,
    generatedAt: string,
  ): LoadedArtifact["data"]["runs"][number] {
    const data = structuredClone(realArtifact().data);
    data.generatedAt = generatedAt;
    data.runs[0]!.server = server;
    fs.writeFileSync(
      path.join(artifactsDir, `${name}-lab-results.json`),
      `${JSON.stringify(data, null, 2)}\n`,
    );
    return data.runs[0]!;
  }

  it("reopens staged files writable before fsync for Windows compatibility", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "league-windows-fsync-"));
    const originalOpenSync = fs.openSync;
    try {
      const artifactsDir = path.join(dir, "artifacts");
      const outDir = path.join(dir, "site");
      fs.mkdirSync(artifactsDir);
      writeRunArtifact(
        artifactsDir,
        "only",
        "windows-fsync",
        "2026-07-05T01:00:00.000Z",
      );
      fs.openSync = ((target, flags, ...rest) => {
        const isStagedFile =
          typeof target === "string" &&
          target.includes(".staging-") &&
          path.extname(target) === ".html";
        if (isStagedFile && flags === "r") {
          throw Object.assign(
            new Error("simulated Windows fsync requires a writable descriptor"),
            { code: "EPERM" },
          );
        }
        return Reflect.apply(originalOpenSync, fs, [target, flags, ...rest]);
      }) as typeof fs.openSync;

      expect(() =>
        buildSite({
          artifactsDir,
          suitesDir: path.join(repoRoot, "suites"),
          outDir,
        }),
      ).not.toThrow();
      expect(fs.existsSync(path.join(outDir, "index.html"))).toBe(true);
    } finally {
      fs.openSync = originalOpenSync;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("replaces the complete site so removed runs leave no stale box page", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "league-atomic-"));
    try {
      const artifactsDir = path.join(dir, "artifacts");
      const outDir = path.join(dir, "site");
      fs.mkdirSync(artifactsDir);
      writeRunArtifact(
        artifactsDir,
        "first",
        "first-server",
        "2026-07-05T01:00:00.000Z",
      );
      const removedRun = writeRunArtifact(
        artifactsDir,
        "second",
        "second-server",
        "2026-07-05T02:00:00.000Z",
      );
      buildSite({
        artifactsDir,
        suitesDir: path.join(repoRoot, "suites"),
        outDir,
      });
      const stalePath = path.join(
        outDir,
        boxScoreFilename(removedRun, "2026-07-05T02:00:00.000Z"),
      );
      expect(fs.existsSync(stalePath)).toBe(true);

      fs.rmSync(path.join(artifactsDir, "second-lab-results.json"));
      buildSite({
        artifactsDir,
        suitesDir: path.join(repoRoot, "suites"),
        outDir,
      });
      expect(fs.existsSync(stalePath)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves the previously published site untouched on a mid-render exception", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "league-render-"));
    const originalCreateHash = crypto.createHash;
    try {
      const artifactsDir = path.join(dir, "artifacts");
      const outDir = path.join(dir, "site");
      fs.mkdirSync(artifactsDir);
      fs.mkdirSync(outDir);
      fs.writeFileSync(path.join(outDir, "index.html"), "KNOWN-GOOD\n");
      writeRunArtifact(
        artifactsDir,
        "only",
        "render-failure",
        "2026-07-05T01:00:00.000Z",
      );
      let calls = 0;
      crypto.createHash = ((...args: Parameters<typeof crypto.createHash>) => {
        calls++;
        if (calls === 2) throw new Error("deliberate render failure");
        return Reflect.apply(originalCreateHash, crypto, args);
      }) as typeof crypto.createHash;

      expect(() =>
        buildSite({
          artifactsDir,
          suitesDir: path.join(repoRoot, "suites"),
          outDir,
        }),
      ).toThrow(/deliberate render failure/);
      expect(fs.readFileSync(path.join(outDir, "index.html"), "utf8")).toBe(
        "KNOWN-GOOD\n",
      );
      expect(fs.readdirSync(outDir)).toEqual(["index.html"]);
    } finally {
      crypto.createHash = originalCreateHash;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects duplicate rendered destinations before replacing the live site", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "league-duplicate-"));
    const originalCreateHash = crypto.createHash;
    try {
      const artifactsDir = path.join(dir, "artifacts");
      const outDir = path.join(dir, "site");
      fs.mkdirSync(artifactsDir);
      fs.mkdirSync(outDir);
      fs.writeFileSync(path.join(outDir, "index.html"), "KNOWN-GOOD\n");
      writeRunArtifact(
        artifactsDir,
        "first",
        "same/name",
        "2026-07-05T01:00:00.000Z",
      );
      writeRunArtifact(
        artifactsDir,
        "second",
        "same-name",
        "2026-07-05T02:00:00.000Z",
      );
      crypto.createHash = (() =>
        ({
          update() {
            return this;
          },
          digest() {
            return "0".repeat(64);
          },
        }) as unknown as crypto.Hash) as typeof crypto.createHash;

      expect(() =>
        buildSite({
          artifactsDir,
          suitesDir: path.join(repoRoot, "suites"),
          outDir,
        }),
      ).toThrow(/duplicate.*destination/i);
      expect(fs.readFileSync(path.join(outDir, "index.html"), "utf8")).toBe(
        "KNOWN-GOOD\n",
      );
    } finally {
      crypto.createHash = originalCreateHash;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an empty publication unless allowEmpty is explicit", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "league-empty-"));
    try {
      const opts = {
        artifactsDir: path.join(dir, "missing-artifacts"),
        suitesDir: path.join(repoRoot, "suites"),
        outDir: path.join(dir, "site"),
      };
      expect(() => buildSite(opts)).toThrow(/empty|artifact/i);
      expect(fs.existsSync(opts.outDir)).toBe(false);

      const report = buildSite({ ...opts, allowEmpty: true });
      expect(report.pages).toHaveLength(1);
      expect(fs.existsSync(path.join(opts.outDir, "index.html"))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
