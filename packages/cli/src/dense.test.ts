import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DENSE_APPROX_MB,
  denseModulesDir,
  denseRuntimeDir,
  denseStatusLine,
  installDenseRuntime,
  isDenseAvailable,
  isDenseInstalledIn,
} from "./dense.js";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-dense-"));
  process.env.ROSTER_TEST_HOME = home;
  process.env.ROSTER_HOME = path.join(home, ".roster");
});
afterEach(() => {
  delete process.env.ROSTER_TEST_HOME;
  delete process.env.ROSTER_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

/** A stand-in for the real 385 MB package, so nothing here touches the network. */
function plantFakeRuntime(): void {
  const pkgDir = path.join(denseModulesDir(), "@huggingface", "transformers");
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name: "@huggingface/transformers", version: "4.2.0", main: "index.js" }),
  );
  fs.writeFileSync(path.join(pkgDir, "index.js"), "module.exports = { pipeline: () => {} };\n");
}

describe("optional dense runtime", () => {
  it("does not see a runtime in the Roster-owned directory until one is installed", () => {
    // NB: assert the OWNED directory, not ambient availability — this repo's
    // own workspace has the package, and so may a user's global install.
    expect(isDenseInstalledIn(denseModulesDir())).toBe(false);
    plantFakeRuntime();
    expect(isDenseInstalledIn(denseModulesDir())).toBe(true);
  });

  it("counts the Roster-owned copy as available and says so", () => {
    plantFakeRuntime();
    expect(isDenseAvailable()).toBe(true);
    expect(denseStatusLine()).toMatch(/ON/);
  });

  it("the OFF message names the size and the exact command to enable it", () => {
    // Rendered from the same constants the prompt uses, so the number a user is
    // quoted can never drift from the number the installer reports.
    const off = `semantic search: OFF (lexical only) — enable with \`roster dense enable\` (~${DENSE_APPROX_MB} MB, local only)`;
    expect(off).toContain("roster dense enable");
    expect(off).toContain(String(DENSE_APPROX_MB));
  });

  it("installs into ~/.roster/runtime with a manifest that pins npm to that prefix", () => {
    const calls: string[][] = [];
    const result = installDenseRuntime((cmd, args) => {
      calls.push([cmd, ...args]);
      plantFakeRuntime(); // pretend npm succeeded
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    });

    expect(result.ok).toBe(true);
    const [call] = calls;
    expect(call?.[0]).toBe("npm");
    expect(call).toContain("--prefix");
    expect(call?.[call.indexOf("--prefix") + 1]).toBe(denseRuntimeDir());
    // Without this manifest npm walks up and installs into the user's project.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(denseRuntimeDir(), "package.json"), "utf8"),
    ) as { private: boolean };
    expect(manifest.private).toBe(true);
    // The runtime directory holds credentials-adjacent nothing, but it lives
    // inside ~/.roster and must not widen that tree's permissions.
    if (process.platform !== "win32") {
      expect(fs.statSync(denseRuntimeDir()).mode & 0o077).toBe(0);
    }
  });

  it("reports failure instead of pretending, when npm exits non-zero", () => {
    const result = installDenseRuntime(() => ({
      status: 1,
      stdout: "",
      stderr: "npm ERR! network timeout",
      pid: 1,
      output: [],
      signal: null,
    }));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("network timeout");
  });

  it("does not claim success when npm exits 0 but the runtime is still missing", () => {
    const result = installDenseRuntime(() => ({
      status: 0,
      stdout: "",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
    }));
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/still not resolvable/);
  });
});

/**
 * The prompt must never block an unattended install. `npx -y @roster/cli init`
 * inside CI, a Dockerfile, or an agent has no TTY: it has to finish on its own
 * and simply say how to enable semantic search later.
 */
describe("the install-time offer is safe when nobody is watching", () => {
  const runInit = (args: string[] = []) =>
    spawnSync(process.execPath, [BIN, "init", ...args], {
      encoding: "utf8",
      timeout: 20_000,
      env: {
        ...process.env,
        ROSTER_TEST_HOME: home,
        ROSTER_HOME: path.join(home, ".roster"),
        ROSTER_NO_FETCH: "1",
      },
      input: "", // stdin is a pipe, not a TTY
    });

  it("finishes without prompting, and prints the hint", () => {
    const result = runInit();
    expect(result.error).toBeUndefined(); // notably: not a timeout
    expect(result.status).toBe(0);
    // Nothing may be installed behind the user's back, and the owned directory
    // must not even be created by a non-interactive run.
    expect(isDenseInstalledIn(denseModulesDir())).toBe(false);
  });

  it("--no-dense stays silent about it and installs nothing", () => {
    const result = runInit(["--no-dense"]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("roster dense enable");
    expect(isDenseInstalledIn(denseModulesDir())).toBe(false);
  });
});
