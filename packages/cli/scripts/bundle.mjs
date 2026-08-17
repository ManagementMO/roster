#!/usr/bin/env node
/**
 * Build the PUBLISHABLE artifact.
 *
 * Why this exists: `@roster/cli` depends on five workspace packages
 * (`@roster/coach|router|playbook|combine|shared`). `pnpm pack` rewrites
 * `workspace:*` into the exact version `0.0.1`, so the published tarball asked
 * npm for five packages that do not exist on the registry — `npx -y @roster/cli`
 * could never resolve for anyone outside this repo (round-6 review R6-03).
 *
 * The fix is to inline exactly the code that isn't published and nothing else:
 *   - `@roster/*` is BUNDLED (it is ours, and it has no independent consumers);
 *   - every third-party package stays EXTERNAL and remains a real dependency, so
 *     native builds (better-sqlite3), optional models (@huggingface/transformers),
 *     and licensing/attribution all behave exactly as they do today.
 *
 * The workspace keeps using `dist/` (tsc output) for tests, probes, and the lab
 * scripts; only `publishConfig` repoints the published entrypoints at `bundle/`.
 */
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(pkgRoot, "bundle");
const manifest = JSON.parse(readFileSync(path.join(pkgRoot, "package.json"), "utf8"));

/**
 * Externalize every bare import EXCEPT our own unpublished packages. Encoding
 * the rule (rather than listing names) means a new third-party dependency is
 * external by default — the safe direction — and a new `@roster/*` workspace
 * package is inlined automatically instead of silently becoming an
 * unresolvable dependency of the published tarball.
 *
 * `@roster/cli` itself is the entry point, never an import, so the whole scope
 * can be inlined without a self-reference.
 */
const externalizeEverythingButOurPackages = {
  name: "externalize-published-deps",
  setup(build) {
    build.onResolve({ filter: /^[^./]|^\.[^./]|^\.\.[^/]/ }, (args) => {
      if (args.path.startsWith("@roster/")) return null; // bundle ours
      return { external: true };
    });
  },
};

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const result = await build({
  entryPoints: {
    bin: path.join(pkgRoot, "src/bin.ts"),
    index: path.join(pkgRoot, "src/index.ts"),
  },
  outdir,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22.13", // the engines floor, not the build machine's Node
  sourcemap: false,
  legalComments: "inline", // keep any bundled licence headers intact
  // No `banner` here: esbuild already carries the entry file's own shebang
  // through, and adding one produced a SECOND `#!` line — invalid JS that made
  // the published binary fail to parse on the very first run. Asserted below.
  plugins: [externalizeEverythingButOurPackages],
  metafile: true,
  logLevel: "warning",
});

chmodSync(path.join(outdir, "bin.js"), 0o755);

// Exactly one shebang, on line 1 of the executable only. A duplicate `#!` is a
// SyntaxError that no unit test would catch — it only shows up when the packed
// binary is actually run, which is precisely the failure this bundle exists to
// prevent shipping.
const binLines = readFileSync(path.join(outdir, "bin.js"), "utf8").split("\n");
if (binLines[0] !== "#!/usr/bin/env node" || binLines[1]?.startsWith("#!")) {
  throw new Error(
    `bundle/bin.js must start with exactly one shebang (line1=${JSON.stringify(binLines[0])}, line2=${JSON.stringify(binLines[1])})`,
  );
}
if (readFileSync(path.join(outdir, "index.js"), "utf8").startsWith("#!")) {
  throw new Error("bundle/index.js is a library entrypoint and must not carry a shebang");
}

// A bundle that still imports an unpublished package would reproduce the exact
// bug this script exists to prevent, so fail the build rather than ship it.
const imported = new Set();
for (const input of Object.values(result.metafile.outputs)) {
  for (const entry of input.imports ?? []) {
    if (entry.external) imported.add(entry.path);
  }
}
const unpublished = [...imported].filter((name) => name.startsWith("@roster/"));
if (unpublished.length > 0) {
  throw new Error(`bundle still imports unpublished packages: ${unpublished.join(", ")}`);
}

// Every remaining external must be declared, or the published package would
// resolve it from the consumer's tree by luck.
const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
]);
const bare = [...imported].filter((name) => !name.startsWith("node:"));
const packageOf = (specifier) =>
  specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
const undeclared = [...new Set(bare.map(packageOf))].filter((name) => !declared.has(name));
if (undeclared.length > 0) {
  throw new Error(
    `bundle imports undeclared dependencies: ${undeclared.join(", ")} — add them to @roster/cli dependencies`,
  );
}

// Nothing else is written into `bundle/`: the tarball ships the two entry
// points and the manifest, and that is all a consumer should ever see. What was
// inlined and why is repository provenance (docs/release-readiness.md), not
// payload — the published package must not carry internal package names.

const sizes = Object.entries(result.metafile.outputs)
  .filter(([file]) => file.endsWith(".js"))
  .map(([file, meta]) => `${path.basename(file)} ${(meta.bytes / 1024).toFixed(0)} KiB`)
  .join(" · ");
process.stdout.write(
  `bundle: ${sizes}\nbundle: external → ${[...new Set(bare.map(packageOf))].sort().join(", ")}\n`,
);
