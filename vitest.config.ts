import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@roster/shared": pkg("shared"),
      "@roster/coach": pkg("coach"),
      "@roster/playbook": pkg("playbook"),
      "@roster/router": pkg("router"),
      "@roster/combine": pkg("combine"),
      "@roster/league": fileURLToPath(new URL("./apps/league/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
    ],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    /**
     * Pinned, not inherited from the default.
     *
     * The trust-path suites legitimately drive PROCESS-global APIs that worker
     * threads cannot: `process.chdir()` (project-scoped client configs are
     * discovered relative to cwd) and `process.umask()` (the 0600/0700
     * permission guarantees are only meaningful under a permissive umask).
     * Under `pool: "threads"` those four tests fail with an opaque
     * "not supported in workers" TypeError rather than a useful message — so a
     * future Vitest default change, or someone switching pools to chase speed,
     * would quietly break the tests that protect the user's config files.
     * Forks are the contract; state it here.
     */
    pool: "forks",
    /**
     * Also pinned. Several suites set `process.env.ROSTER_HOME` in `beforeEach`
     * and spawn child processes from that environment; sharing one process
     * across files lets those hooks overwrite each other mid-test. Running
     * `--no-isolate` produced a *false* mutual-exclusion failure in the lock
     * suite — the most alarming possible red herring. Isolation is a
     * correctness requirement here, not a performance knob.
     */
    isolate: true,
    /**
     * On CI, annotate the failing test in the GitHub UI and write a JUnit file
     * the workflow uploads.
     *
     * Round 6 lost a real defect to a filtered console: a single test failed
     * roughly one run in eight, its name was swallowed, and it was very nearly
     * written off as "an unidentified flake". It was actually a permanently
     * wedged lock (R6-08). A failure that cannot be named cannot be fixed, so
     * naming it is now a property of the pipeline rather than of whoever
     * happens to be reading the log.
     */
    reporters: process.env.CI ? ["default", "github-actions", "junit"] : ["default"],
    outputFile: { junit: "./test-results.junit.xml" },
  },
});
