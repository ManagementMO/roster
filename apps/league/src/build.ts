import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseSuite } from "@rosterhq/combine";
import {
  certifyRun,
  latestRuns,
  parseLabResults,
  suiteKey,
  withoutSignedCredit,
  type LoadedArtifact,
  type SuiteSigning,
} from "./artifact.js";
import { boxScoreFilename, renderBoxScore, renderStandings } from "./pages.js";

export interface BuildOptions {
  artifactsDir: string;
  suitesDir: string;
  outDir: string;
}

export interface BuildReport {
  pages: string[];
  artifactsLoaded: number;
  skipped: Array<{ path: string; reason: string }>;
  /** Rendered, but stripped of signed credit — shown, never ranked. */
  uncertified: Array<{ path: string; server: string; reason: string }>;
}

interface LoadedSuites {
  descriptions: Map<string, string>;
  /** The authority a run's `signed` flags are checked against. */
  signing: Map<string, Map<string, boolean>>;
}

/**
 * The suites are the signing AUTHORITY (reviewed, versioned, in-repo); an
 * artifact's `signed` flags are only a copy. A suite that fails to parse simply
 * doesn't enter the map — which makes every run against it `unverifiable`, i.e.
 * unrankable. That is the fail-closed direction: a broken suite can cost a
 * server its rank, but it can never mint one.
 */
function loadSuites(suitesDir: string): LoadedSuites {
  const descriptions = new Map<string, string>();
  const signing = new Map<string, Map<string, boolean>>();
  if (!fs.existsSync(suitesDir)) return { descriptions, signing };
  for (const dir of fs.readdirSync(suitesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = path.join(suitesDir, dir.name, "tasks.yaml");
    if (!fs.existsSync(file)) continue;
    try {
      const suite = parseSuite(fs.readFileSync(file, "utf8"));
      const signed = new Map<string, boolean>();
      for (const task of suite.tasks) {
        if (task.description !== undefined) descriptions.set(task.id, task.description);
        signed.set(task.id, task.signed);
      }
      signing.set(suiteKey(suite.suite, suite.version), signed);
    } catch {
      // Cosmetic descriptions must not block standings; and an uncertifiable
      // suite already fails closed above (its runs cannot rank).
    }
  }
  return { descriptions, signing };
}

export function buildSite(opts: BuildOptions): BuildReport {
  const skipped: BuildReport["skipped"] = [];
  const loaded: LoadedArtifact[] = [];

  if (fs.existsSync(opts.artifactsDir)) {
    for (const name of fs.readdirSync(opts.artifactsDir).sort()) {
      if (!name.endsWith("lab-results.json")) continue;
      const file = path.join(opts.artifactsDir, name);
      try {
        loaded.push({ path: file, data: parseLabResults(fs.readFileSync(file, "utf8"), file) });
      } catch (err) {
        skipped.push({ path: file, reason: (err as Error).message });
      }
    }
  }

  const { descriptions, signing } = loadSuites(opts.suitesDir);

  // Certify BEFORE rendering: a `signed` flag in an artifact is a claim about a
  // human's act, and only the suite can confirm it. Tampered runs are dropped;
  // unverifiable ones are shown without signed credit (visible, never ranked).
  const uncertified: BuildReport["uncertified"] = [];
  const entries = latestRuns(loaded).flatMap((entry) => {
    const cert = certifyRun(entry.run, signing as SuiteSigning);
    if (cert.status === "certified") return [entry];
    if (cert.status === "tampered") {
      skipped.push({ path: entry.artifact.path, reason: `run "${entry.run.server}": ${cert.reason}` });
      return [];
    }
    uncertified.push({ path: entry.artifact.path, server: entry.run.server, reason: cert.reason });
    return [{ ...entry, run: withoutSignedCredit(entry.run) }];
  });

  fs.mkdirSync(opts.outDir, { recursive: true });
  const pages: string[] = [];

  const indexPath = path.join(opts.outDir, "index.html");
  fs.writeFileSync(indexPath, renderStandings(entries));
  pages.push(indexPath);

  for (const entry of entries) {
    const boxPath = path.join(opts.outDir, boxScoreFilename(entry.run));
    fs.writeFileSync(boxPath, renderBoxScore(entry, descriptions));
    pages.push(boxPath);
  }

  return { pages, artifactsLoaded: loaded.length, skipped, uncertified };
}

const flagValue = (argv: string[], name: string): string | undefined => {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : undefined;
};

export function main(argv = process.argv.slice(2)): number {
  const opts: BuildOptions = {
    artifactsDir: flagValue(argv, "--artifacts") ?? "docs/verification",
    suitesDir: flagValue(argv, "--suites") ?? "suites",
    outDir: flagValue(argv, "--out") ?? "apps/league/dist-site",
  };
  const report = buildSite(opts);
  for (const s of report.skipped) {
    process.stderr.write(`league: SKIPPED ${s.path}\n        ${s.reason}\n`);
  }
  for (const u of report.uncertified) {
    process.stderr.write(
      `league: UNCERTIFIED "${u.server}" — shown without signed credit, cannot rank\n        ${u.reason}\n`,
    );
  }
  for (const p of report.pages) process.stdout.write(`league: wrote ${p}\n`);
  process.stdout.write(
    `league: ${report.pages.length} page(s) from ${report.artifactsLoaded} artifact(s)` +
      (report.skipped.length > 0 ? ` (${report.skipped.length} skipped — see above)` : "") +
      "\n",
  );
  return report.artifactsLoaded === 0 && report.skipped.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
