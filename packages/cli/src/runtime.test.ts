import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const BIN = path.resolve(__dirname, "../dist/bin.js");
let home: string;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-runtime-")); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

function runWindowsRuntime(node: string, uv: string) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", `
    Object.defineProperty(process, "platform", { value: "win32" });
    Object.defineProperty(process.versions, "node", { value: ${JSON.stringify(node)} });
    Object.defineProperty(process.versions, "uv", { value: ${JSON.stringify(uv)} });
    process.argv = [process.execPath, ${JSON.stringify(BIN)}, "init", "--no-dense"];
    await import(${JSON.stringify(pathToFileURL(BIN).href)});
  `], {
    encoding: "utf8", timeout: 15_000,
    env: { ...process.env, ROSTER_TEST_HOME: home, ROSTER_HOME: path.join(home, ".roster"), ROSTER_NO_FETCH: "1" },
  });
}

describe("Windows runtime safety gate", () => {
  it.each([
    ["22.13.1", "1.49.2"],
    ["23.11.0", "1.50.0"],
    ["24.0.0", "1.50.0"],
  ])("refuses affected Node %s before creating local state", (node, uv) => {
    const result = runWindowsRuntime(node, uv);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("22.17");
    expect(result.stderr).toContain("24.2");
    expect(fs.existsSync(path.join(home, ".roster"))).toBe(false);
  });

  it.each([
    ["22.17.0", "1.51.0"],
    ["24.2.0", "1.51.0"],
  ])("permits patched Node %s without weakening the normal init path", (node, uv) => {
    const result = runWindowsRuntime(node, uv);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(home, ".roster", "roster.json"), "utf8"));
    expect(config.telemetry.enabled).toBe(false);
    expect(config.servers).toEqual({});
  });
});
