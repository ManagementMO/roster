import { spawnSync } from "node:child_process";
import { ownedEmbeddingRuntimeEntry } from "@roster/coach";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DENSE_APPROX_MB,
  DENSE_ADM_ZIP_TARBALL,
  denseModulesDir,
  denseRuntimeDir,
  denseStatusLine,
  installDenseRuntime,
  isDenseAvailable,
  isDenseInstalledIn,
} from "./dense.js";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const ORT_FIXTURE = 'exports.env = { wasm: {} }; exports.Tensor = class { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } }; exports.InferenceSession = { async create() { return { async run(feeds) { return { result: feeds.value }; }, async release() {} }; } };';

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
  const ort = path.join(pkgDir, "node_modules", "onnxruntime-node");
  fs.mkdirSync(ort, { recursive: true });
  fs.writeFileSync(path.join(ort, "package.json"), JSON.stringify({ main: "index.cjs" }));
  fs.writeFileSync(path.join(ort, "index.cjs"), ORT_FIXTURE);
}

describe("optional dense runtime", () => {
  it("does not see a runtime in the Roster-owned directory until one is installed", () => {
    // NB: assert the OWNED directory, not ambient availability — this repo's
    // own workspace has the package, and so may a user's global install.
    expect(isDenseInstalledIn(denseModulesDir())).toBe(false);
    plantFakeRuntime();
    expect(isDenseInstalledIn(denseModulesDir())).toBe(true);
  });

  it("reports runtime readiness without claiming search or a model is already active", () => {
    plantFakeRuntime();
    expect(isDenseAvailable()).toBe(true);
    expect(denseStatusLine()).toMatch(/READY/);
    expect(denseStatusLine()).not.toMatch(/search: ON/);
  });

  it("rejects npm success when the installed native runtime cannot load", () => {
    const result = installDenseRuntime(() => {
      plantFakeRuntime();
      fs.writeFileSync(path.join(denseModulesDir(), "@huggingface", "transformers", "index.js"), 'throw Object.assign(new Error("native binding missing"), { code: "ERR_DLOPEN_FAILED" });');
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/unusable|unavailable|cannot load/);
  });

  it("rejects a package manifest that has no usable inference interface", () => {
    const result = installDenseRuntime(() => {
      plantFakeRuntime();
      fs.writeFileSync(path.join(denseModulesDir(), "@huggingface", "transformers", "index.js"), "module.exports = {};\n");
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    });
    expect(result.ok).toBe(false);
  });

  it("reports the portable backend only after it executes the readiness probe", () => {
    const result = installDenseRuntime(() => {
      plantFakeRuntime();
      const pkgDir = path.join(denseModulesDir(), "@huggingface", "transformers");
      fs.writeFileSync(path.join(pkgDir, "index.js"), 'throw new Error("native binding unavailable");');
      fs.writeFileSync(path.join(pkgDir, "transformers.web.js"), 'exports.env = {}; exports.pipeline = async () => {};');
      const ort = path.join(pkgDir, "node_modules", "onnxruntime-web");
      fs.mkdirSync(path.join(ort, "dist"), { recursive: true });
      fs.writeFileSync(path.join(ort, "package.json"), JSON.stringify({ main: "dist/ort.node.min.js" }));
      fs.writeFileSync(path.join(ort, "dist", "ort.node.min.js"), ORT_FIXTURE);
      fs.writeFileSync(path.join(ort, "dist", "ort-wasm-simd-threaded.mjs"), "export default {};");
      fs.writeFileSync(path.join(ort, "dist", "ort-wasm-simd-threaded.wasm"), "fixture");
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    });
    expect(result.ok, result.detail).toBe(true);
    expect(result).toHaveProperty("backend", "wasm");
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
      const manifest = JSON.parse(fs.readFileSync(path.join(denseRuntimeDir(), "package.json"), "utf8"));
      expect(manifest.overrides["adm-zip"]).toBe(DENSE_ADM_ZIP_TARBALL);
      plantFakeRuntime(); // pretend npm succeeded
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    });

    expect(result.ok).toBe(true);
    const [call] = calls;
    expect(call?.[0]).toBe("npm");
    expect(call).toContain("--prefix");
    expect(call?.[call.indexOf("--prefix") + 1]).toBe(fs.realpathSync(denseRuntimeDir()));
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

  it("keeps an already patched prefix manifest byte-for-byte on a second install", () => {
    const spawnStub = () => {
      plantFakeRuntime();
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    };
    expect(installDenseRuntime(spawnStub).ok).toBe(true);
    // A second run must not throw on the already-present manifest, and must not
    // clobber it either.
    const before = fs.readFileSync(path.join(denseRuntimeDir(), "package.json"), "utf8");
    expect(installDenseRuntime(spawnStub).ok).toBe(true);
    expect(fs.readFileSync(path.join(denseRuntimeDir(), "package.json"), "utf8")).toBe(before);
  });

  it("accepts a repaired runtime after a missing-manifest lookup in the installing process", () => {
    plantFakeRuntime();
    const pkg = path.join(denseModulesDir(), "@huggingface", "transformers");
    fs.mkdirSync(path.join(pkg, "dist"));
    fs.renameSync(path.join(pkg, "index.js"), path.join(pkg, "dist", "restored.cjs"));
    fs.unlinkSync(path.join(pkg, "package.json"));
    expect(ownedEmbeddingRuntimeEntry(denseModulesDir())).toBeNull();
    const result = installDenseRuntime(() => {
      fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@huggingface/transformers", main: "dist/restored.cjs" }));
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    });
    expect(result.ok, result.detail).toBe(true);
    expect(result.backend).toBe("native");
  });

  it("verifies a replacement entrypoint instead of a cached removed entrypoint", () => {
    plantFakeRuntime();
    const pkg = path.join(denseModulesDir(), "@huggingface", "transformers");
    expect(ownedEmbeddingRuntimeEntry(denseModulesDir())).toBe(fs.realpathSync(path.join(pkg, "index.js")));
    const result = installDenseRuntime(() => {
      fs.renameSync(path.join(pkg, "index.js"), path.join(pkg, "replacement.cjs"));
      fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@huggingface/transformers", main: "replacement.cjs" }));
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    });
    expect(result.ok, result.detail).toBe(true);
    expect(result.backend).toBe("native");
  });

  it("does not bless a cached healthy entrypoint when the new manifest selects a broken one", () => {
    plantFakeRuntime();
    const pkg = path.join(denseModulesDir(), "@huggingface", "transformers");
    expect(ownedEmbeddingRuntimeEntry(denseModulesDir())).not.toBeNull();
    const result = installDenseRuntime(() => {
      fs.writeFileSync(path.join(pkg, "broken.cjs"), "module.exports = {};\n");
      fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@huggingface/transformers", main: "broken.cjs" }));
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/unusable/);
  });

  it("uses the canonical npm prefix when ROSTER_HOME contains a directory alias", () => {
    const actualHome = path.join(home, "actual home");
    const alias = path.join(home, "aliased home");
    fs.mkdirSync(actualHome);
    fs.symlinkSync(actualHome, alias, process.platform === "win32" ? "junction" : "dir");
    process.env.ROSTER_HOME = alias;
    const result = installDenseRuntime((_cmd, args) => {
      expect(args[args.indexOf("--prefix") + 1]).toBe(
        fs.realpathSync(path.join(actualHome, "runtime")),
      );
      plantFakeRuntime();
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    });
    expect(result.ok).toBe(true);
  });

  it("patches an existing runtime before npm starts and preserves its other settings", () => {
    fs.mkdirSync(denseRuntimeDir(), { recursive: true });
    const manifest = path.join(denseRuntimeDir(), "package.json");
    const previous = {
      name: "roster-dense-runtime",
      private: true,
      dependencies: { "@huggingface/transformers": "^4.2.0" },
      overrides: { "adm-zip": "0.6.0", "unrelated-dependency": "1.2.3" },
    };
    fs.writeFileSync(manifest, JSON.stringify(previous));
    const result = installDenseRuntime(() => {
      expect(JSON.parse(fs.readFileSync(manifest, "utf8"))).toEqual({
        ...previous,
        overrides: { ...previous.overrides, "adm-zip": DENSE_ADM_ZIP_TARBALL },
      });
      if (process.platform !== "win32") expect(fs.statSync(manifest).mode & 0o077).toBe(0);
      plantFakeRuntime();
      return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
    });
    expect(result.ok).toBe(true);
  });

  it.each(["{", "null", "[]", '{"overrides":[]}'])(
    "leaves an invalid manifest untouched and never starts npm: %s",
    (content) => {
      fs.mkdirSync(denseRuntimeDir(), { recursive: true });
      const manifest = path.join(denseRuntimeDir(), "package.json");
      fs.writeFileSync(manifest, content);
      let called = false;
      const result = installDenseRuntime(() => {
        called = true;
        throw new Error("npm must not run");
      });
      expect(result.ok).toBe(false);
      expect(result.detail).toContain("Cannot prepare semantic runtime");
      expect(called).toBe(false);
      expect(fs.readFileSync(manifest, "utf8")).toBe(content);
    },
  );

  it("refuses a symlinked manifest without changing the external file", () => {
    fs.mkdirSync(denseRuntimeDir(), { recursive: true });
    const outside = path.join(home, "outside.json");
    const original = '{"name":"outside"}';
    fs.writeFileSync(outside, original);
    fs.symlinkSync(outside, path.join(denseRuntimeDir(), "package.json"), "file");
    let called = false;
    const result = installDenseRuntime(() => {
      called = true;
      throw new Error("npm must not run");
    });
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
    expect(fs.readFileSync(outside, "utf8")).toBe(original);
  });

  it("an explicit enable checks an existing owned runtime instead of returning already enabled", () => {
    plantFakeRuntime();
    // Fail before npm can start: this proves the real command reaches manifest
    // migration even when isDenseAvailable() is already true, without a download.
    fs.writeFileSync(path.join(denseRuntimeDir(), "package.json"), "{");
    const result = spawnSync(process.execPath, [BIN, "dense", "enable"], {
      encoding: "utf8", timeout: 20_000, env: { ...process.env },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Cannot prepare semantic runtime");
    expect(result.stdout).not.toContain("already enabled");
  });

  it("starts the default npm executable and preserves a prefix containing shell metacharacters", () => {
    const originalPath = process.env.PATH;
    const ownedHome = path.join(home, "runtime home & (literal)");
    process.env.ROSTER_HOME = ownedHome;
    const bin = path.join(home, "npm bin");
    const script = path.join(bin, "npm-fixture.cjs");
    const captured = path.join(home, "npm-args.json");
    fs.mkdirSync(bin);
    fs.writeFileSync(script, `
      const fs = require("node:fs");
      const path = require("node:path");
      const args = process.argv.slice(2);
      const prefix = args[args.indexOf("--prefix") + 1];
      fs.writeFileSync(${JSON.stringify(captured)}, JSON.stringify(args));
      const target = path.join(prefix, "node_modules", "@huggingface", "transformers");
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({ name: "@huggingface/transformers", version: "4.2.0", main: "index.js" }));
      fs.writeFileSync(path.join(target, "index.js"), "exports.pipeline = () => {};");
      const ort = path.join(target, "node_modules", "onnxruntime-node");
      fs.mkdirSync(ort, { recursive: true });
      fs.writeFileSync(path.join(ort, "package.json"), JSON.stringify({ main: "index.cjs" }));
      fs.writeFileSync(path.join(ort, "index.cjs"), ${JSON.stringify(ORT_FIXTURE)});
    `);
    fs.writeFileSync(path.join(bin, process.platform === "win32" ? "npm.cmd" : "npm"),
      process.platform === "win32"
        ? `@"${process.execPath}" "${script}" %*\r\n`
        : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
      { mode: 0o755 });
    process.env.PATH = [bin, path.dirname(process.execPath), ...(process.platform === "win32"
      ? [path.win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32")]
      : ["/usr/bin", "/bin"])].join(path.delimiter);
    try {
      const result = installDenseRuntime();
      expect(result.ok, result.detail).toBe(true);
      const args = JSON.parse(fs.readFileSync(captured, "utf8")) as string[];
      expect(args[0]).toBe("install");
      expect(args[args.indexOf("--prefix") + 1]).toBe(fs.realpathSync(path.join(ownedHome, "runtime")));
      expect(fs.existsSync(path.join(ownedHome, "runtime", "node_modules", "@huggingface", "transformers", "package.json"))).toBe(true);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
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
