import crypto from "node:crypto";
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
  type SuiteAuthority,
} from "./artifact.js";
import { boxScoreFilename, renderBoxScore, renderStandings } from "./pages.js";

export interface BuildOptions {
  artifactsDir: string;
  suitesDir: string;
  outDir: string;
  allowEmpty?: boolean;
}

export interface BuildReport {
  pages: string[];
  artifactsLoaded: number;
  skipped: Array<{ path: string; reason: string }>;
  /** Rendered, but stripped of signed credit — shown, never ranked. */
  uncertified: Array<{ path: string; server: string; reason: string }>;
}

export interface LoadedSuites {
  /** Exact suite/version authority for category, signing, and descriptions. */
  authorities: Map<string, SuiteAuthority>;
}

/**
 * The suites are the signing AUTHORITY (reviewed, versioned, in-repo); an
 * artifact's `signed` flags are only a copy. A suite that fails to parse simply
 * doesn't enter the map — which makes every run against it `unverifiable`, i.e.
 * unrankable. That is the fail-closed direction: a broken suite can cost a
 * server its rank, but it can never mint one.
 */
export function loadSuites(suitesDir: string): LoadedSuites {
  const authorities = new Map<string, SuiteAuthority>();
  // A (suite, version) that appears in more than one suite directory is an
  // AMBIGUOUS authority. Silently letting the last-loaded one win (and "last"
  // was filesystem-order roulette — readdir is unsorted) would let a duplicate
  // MINT or STRIP signed credit depending on which copy won, breaking the
  // fail-closed promise that a suite can cost a rank but never mint one.
  const conflicted = new Set<string>();
  if (!fs.existsSync(suitesDir)) return { authorities };
  // Sorted so the build is reproducible regardless of the host filesystem's
  // directory order (the artifacts read below is already `.sort()`ed).
  const dirs = fs
    .readdirSync(suitesDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const file = path.join(suitesDir, dir.name, "tasks.yaml");
    if (!fs.existsSync(file)) continue;
    try {
      const suite = parseSuite(fs.readFileSync(file, "utf8"));
      const key = suiteKey(suite.suite, suite.version);
      // Poison a duplicated key: drop it entirely so every run against it is
      // `unverifiable` (shown, never ranked) — never silently authoritative.
      if (conflicted.has(key)) continue;
      if (authorities.has(key)) {
        authorities.delete(key);
        conflicted.add(key);
        continue;
      }
      authorities.set(key, {
        category: suite.category,
        tasks: new Map(
          suite.tasks.map((task) => [
            task.id,
            {
              signed: task.signed,
              ...(task.description !== undefined
                ? { description: task.description }
                : {}),
            },
          ]),
        ),
      });
    } catch {
      // Cosmetic descriptions must not block standings; and an uncertifiable
      // suite already fails closed above (its runs cannot rank).
    }
  }
  return { authorities };
}

export function buildSite(opts: BuildOptions): BuildReport {
  assertSeparateOutput(opts);
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

  const { authorities } = loadSuites(opts.suitesDir);

  // Certify BEFORE rendering: a `signed` flag in an artifact is a claim about a
  // human's act, and only the suite can confirm it. Tampered runs are dropped;
  // unverifiable ones are shown without signed credit (visible, never ranked).
  const uncertified: BuildReport["uncertified"] = [];
  const entries = latestRuns(loaded)
    .flatMap((entry) => {
      const cert = certifyRun(entry.run, authorities);
      if (cert.status === "certified") return [entry];
      if (cert.status === "tampered") {
        skipped.push({
          path: entry.artifact.path,
          reason: `run "${entry.run.server}": ${cert.reason}`,
        });
        return [];
      }
      uncertified.push({
        path: entry.artifact.path,
        server: entry.run.server,
        reason: cert.reason,
      });
      return [{ ...entry, run: withoutSignedCredit(entry.run) }];
    })
    .sort(
      (a, b) =>
        a.run.category.localeCompare(b.run.category) ||
        a.run.suite.localeCompare(b.run.suite) ||
        a.run.suiteVersion.localeCompare(b.run.suiteVersion) ||
        a.run.server.localeCompare(b.run.server) ||
        Date.parse(a.artifact.data.generatedAt) -
          Date.parse(b.artifact.data.generatedAt),
    );

  if (entries.length === 0 && opts.allowEmpty !== true) {
    throw new Error(
      "league: refusing to publish an empty site; provide a valid artifact or pass --allow-empty explicitly",
    );
  }

  // Render every byte and validate every destination before touching outDir.
  const rendered = new Map<string, string>();
  const addPage = (name: string, html: string): void => {
    if (path.basename(name) !== name || rendered.has(name)) {
      throw new Error(`league: duplicate or unsafe output destination "${name}"`);
    }
    rendered.set(name, html);
  };
  addPage("index.html", renderStandings(entries));

  for (const entry of entries) {
    const filename = boxScoreFilename(
      entry.run,
      entry.artifact.data.generatedAt,
    );
    const descriptions = new Map<string, string>();
    const authority = authorities.get(
      suiteKey(entry.run.suite, entry.run.suiteVersion),
    );
    for (const [taskId, task] of authority?.tasks ?? []) {
      if (task.description !== undefined) {
        descriptions.set(taskId, task.description);
      }
    }
    addPage(filename, renderBoxScore(entry, descriptions));
  }

  publishCompleteSite(opts.outDir, rendered);
  const pages = [...rendered.keys()].map((name) => path.join(opts.outDir, name));
  return { pages, artifactsLoaded: loaded.length, skipped, uncertified };
}

function assertSeparateOutput(opts: BuildOptions): void {
  const out = path.resolve(opts.outDir);
  const contains = (parent: string, child: string): boolean => {
    const relative = path.relative(parent, child);
    return (
      relative === "" ||
      (relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative))
    );
  };
  for (const [label, input] of [
    ["artifacts", opts.artifactsDir],
    ["suites", opts.suitesDir],
  ] as const) {
    const source = path.resolve(input);
    const overlaps = contains(out, source) || contains(source, out);
    if (overlaps) {
      throw new Error(
        `league: output directory must not overlap the ${label} directory`,
      );
    }
  }
}

function pathExists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function fsyncDirectory(dir: string): void {
  try {
    const fd = fs.openSync(dir, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync is unavailable on some platforms/filesystems.
  }
}

function publishCompleteSite(
  outDir: string,
  rendered: ReadonlyMap<string, string>,
): void {
  const output = path.resolve(outDir);
  const parent = path.dirname(output);
  const token = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  const staging = `${output}.staging-${token}`;
  const previous = `${output}.previous-${token}`;

  fs.mkdirSync(parent, { recursive: true });
  fs.mkdirSync(staging, { mode: 0o700 });
  try {
    for (const [name, html] of rendered) {
      const target = path.join(staging, name);
      fs.writeFileSync(target, html, { mode: 0o600 });
      // Windows rejects fsync on a read-only file descriptor. Reopen the
      // already-rendered file without truncation but with write access so the
      // durability barrier is portable.
      const fd = fs.openSync(target, "r+");
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    }
    fsyncDirectory(staging);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }

  let movedPrevious = false;
  try {
    if (pathExists(output)) {
      fs.renameSync(output, previous);
      movedPrevious = true;
    }
    fs.renameSync(staging, output);
    fsyncDirectory(parent);
  } catch (error) {
    try {
      if (movedPrevious && !pathExists(output) && pathExists(previous)) {
        fs.renameSync(previous, output);
        fsyncDirectory(parent);
      }
    } catch (rollbackError) {
      throw new Error(
        `league: site swap failed (${error instanceof Error ? error.message : String(error)}) and rollback also failed (${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}); previous site remains at ${previous}`,
      );
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    throw error;
  }

  if (movedPrevious) {
    try {
      fs.rmSync(previous, { recursive: true });
    } catch {
      // The complete new site is already published; a stale sibling is harmless.
    }
  }
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
    allowEmpty: argv.includes("--allow-empty"),
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
