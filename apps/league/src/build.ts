import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseSuite } from "@rosterhq/combine";
import { latestRuns, parseLabResults, type LoadedArtifact } from "./artifact.js";
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
}

function loadTaskDescriptions(suitesDir: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!fs.existsSync(suitesDir)) return out;
  for (const dir of fs.readdirSync(suitesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = path.join(suitesDir, dir.name, "tasks.yaml");
    if (!fs.existsSync(file)) continue;
    try {
      const suite = parseSuite(fs.readFileSync(file, "utf8"));
      for (const task of suite.tasks) {
        if (task.description !== undefined) out.set(task.id, task.description);
      }
    } catch {
      // Descriptions are cosmetic; a malformed suite must not block standings.
    }
  }
  return out;
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

  const entries = latestRuns(loaded);
  const descriptions = loadTaskDescriptions(opts.suitesDir);

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

  return { pages, artifactsLoaded: loaded.length, skipped };
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
