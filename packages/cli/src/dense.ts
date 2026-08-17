import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ensurePrivateDir, PRIVATE_FILE, rosterHome } from "./paths.js";

/**
 * Optional semantic search, installed on request.
 *
 * `@huggingface/transformers` drags in ~385 MB (onnxruntime-node 212 MB,
 * onnxruntime-web 130 MB — a browser build a Node CLI can never use — and
 * sharp). Declaring it a normal `optionalDependency` made every `npx -y
 * @roster/cli` a 424 MB / 70s-on-home-broadband download before the tool
 * printed a single line, which flatly contradicts the promise that Roster
 * serves instantly and downloads nothing. It is now an OPTIONAL PEER: npm never
 * installs it on its own, the default install is 39 MB, and the user is asked.
 *
 * We install into `~/.roster/runtime` rather than alongside the binary because
 * the binary's location is not ours to write to: `npx` puts it in a throwaway
 * cache, a global install in a root-owned prefix, a project install in the
 * user's tree. A Roster-owned directory behaves the same in all three, survives
 * a CLI upgrade, and is removed by deleting one folder.
 */
export const DENSE_PACKAGE = "@huggingface/transformers";
export const DENSE_RANGE = "^4.2.0";
/** Measured on a clean install; quoted to the user before they agree. */
export const DENSE_APPROX_MB = 385;

export function denseRuntimeDir(): string {
  return path.join(rosterHome(), "runtime");
}

export function denseModulesDir(): string {
  return path.join(denseRuntimeDir(), "node_modules");
}

/**
 * Is the runtime present in THIS directory? A direct filesystem check, not
 * `createRequire(...).resolve()`: Node's resolver walks up the tree (and the
 * test runner shims `createRequire` entirely), so a resolve-based check happily
 * reports "installed" because some ancestor — the developer's own workspace —
 * has a copy. This directory is ours; its contents are the whole question.
 */
export function isDenseInstalledIn(modulesDir: string): boolean {
  return fs.existsSync(path.join(modulesDir, ...DENSE_PACKAGE.split("/"), "package.json"));
}

/**
 * Is dense retrieval available at all? True for the Roster-owned copy, and also
 * when the runtime is resolvable the ordinary way — a user who already has it
 * (globally, as a project dependency, or a developer in this workspace) must
 * never be asked to download 385 MB they already have.
 *
 * Kept separate from `isDenseInstalledIn` because ambient availability depends
 * on where the CLI is installed, while the owned directory is ours to assert.
 */
export function isDenseAvailable(): boolean {
  if (isDenseInstalledIn(denseModulesDir())) return true;
  try {
    createRequire(import.meta.filename).resolve(DENSE_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

export interface DenseInstallResult {
  ok: boolean;
  detail: string;
}

/**
 * Install the runtime into the Roster-owned prefix. `spawn` is injectable so
 * the suite can prove the flow end to end without a 385 MB download.
 */
export function installDenseRuntime(
  spawn: (cmd: string, args: string[]) => SpawnSyncReturns<string> = (cmd, args) =>
    spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "inherit", "pipe"] }),
): DenseInstallResult {
  const dir = ensurePrivateDir(denseRuntimeDir());
  // A package.json in the prefix stops npm from walking up and installing into
  // whatever project the user happens to be standing in.
  const manifest = path.join(dir, "package.json");
  if (!fs.existsSync(manifest)) {
    fs.writeFileSync(
      manifest,
      `${JSON.stringify({ name: "roster-dense-runtime", version: "0.0.0", private: true }, null, 2)}\n`,
      { mode: PRIVATE_FILE },
    );
  }
  const result = spawn("npm", [
    "install",
    `${DENSE_PACKAGE}@${DENSE_RANGE}`,
    "--prefix",
    dir,
    "--no-audit",
    "--no-fund",
    "--loglevel",
    "error",
  ]);
  if (result.error) return { ok: false, detail: result.error.message };
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").toString().trim().split("\n").slice(-3).join(" ");
    return { ok: false, detail: stderr || `npm exited ${result.status}` };
  }
  return isDenseInstalledIn(denseModulesDir())
    ? { ok: true, detail: dir }
    : { ok: false, detail: "npm reported success but the runtime is still not resolvable" };
}

export function denseStatusLine(): string {
  return isDenseAvailable()
    ? "semantic search: ON (embedding runtime installed)"
    : `semantic search: OFF (lexical only) — enable with \`roster dense enable\` (~${DENSE_APPROX_MB} MB, local only)`;
}

/**
 * The offer shown after `roster init`. Truthful about the size and about the
 * fact that Roster is already useful without it.
 */
export function denseOffer(): string {
  return [
    "",
    "Semantic search (optional)",
    "  Roster already works: it matches your tools lexically from second zero.",
    `  The optional embedding runtime adds meaning-based matching. It is ~${DENSE_APPROX_MB} MB,`,
    "  runs entirely on your machine, and sends nothing anywhere.",
    "",
  ].join("\n");
}
