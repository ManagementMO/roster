import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * C3 / serve shutdown. `serve` connected the transport and returned, leaving the
 * backend manager and coach DB unreachable, so terminating `roster serve` (stdin
 * EOF, SIGINT, SIGTERM) orphaned the spawned backend children. These are REAL
 * subprocess tests: a real command-backed MCP backend records its PID, and each
 * case asserts BOTH roster and the backend exit — not a unit test that only
 * calls BackendManager.close().
 */
const REPO = path.resolve(__dirname, "..", "..", "..");
const BIN = path.join(REPO, "packages", "cli", "dist", "bin.js");

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitExit = (c: ChildProcess) =>
  new Promise<number | null>((resolve) => c.on("exit", (code) => resolve(code)));

async function waitFor(fn: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await sleep(25);
  }
  return fn();
}

let homes: string[] = [];
let kids: ChildProcess[] = [];
afterEach(() => {
  for (const k of kids) {
    try {
      k.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
  kids = [];
  for (const h of homes) fs.rmSync(h, { recursive: true, force: true });
  homes = [];
});

/** Spawn `roster serve` over a real backend; resolve once it reports serving. */
async function startServe(): Promise<{ roster: ChildProcess; backendPidFile: string }> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-serve-"));
  homes.push(home);
  const rosterHome = path.join(home, ".roster");
  fs.mkdirSync(rosterHome, { recursive: true });
  const backendPidFile = path.join(home, "backend.pid");

  // A real MCP stdio backend that records its PID on boot and otherwise idles.
  const backend = path.join(home, "backend.mjs");
  const sdkReq = `require_.resolve("@modelcontextprotocol/sdk/server/index.js")`;
  fs.writeFileSync(
    backend,
    `
    import { createRequire } from "node:module";
    import fs from "node:fs";
    const require_ = createRequire(${JSON.stringify(path.join(REPO, "packages/router/package.json"))});
    const { Server } = await import(${sdkReq});
    const { StdioServerTransport } = await import(require_.resolve("@modelcontextprotocol/sdk/server/stdio.js"));
    const { ListToolsRequestSchema } = await import(require_.resolve("@modelcontextprotocol/sdk/types.js"));
    const server = new Server({ name: "pidbackend", version: "0.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
    await server.connect(new StdioServerTransport());
    fs.writeFileSync(${JSON.stringify(backendPidFile)}, String(process.pid));
    `,
  );

  fs.writeFileSync(
    path.join(rosterHome, "roster.json"),
    JSON.stringify({
      version: 1,
      mode: "transparent",
      servers: { pid: { command: process.execPath, args: [backend], importedFrom: ["test"] } },
      skillSources: [],
      telemetry: { enabled: false },
      embeddings: "off",
    }),
  );

  const roster = spawn(process.execPath, [BIN, "serve"], {
    env: { ...process.env, ROSTER_TEST_HOME: home, ROSTER_HOME: rosterHome, ROSTER_NO_FETCH: "1" },
    stdio: ["pipe", "ignore", "pipe"],
  });
  kids.push(roster);
  let err = "";
  roster.stderr?.on("data", (d: Buffer) => {
    err += d.toString();
  });
  // Boot is complete when it reports serving AND the backend has recorded its pid.
  const ready = await waitFor(() => /serving .* in transparent mode/.test(err) && fs.existsSync(backendPidFile), 20_000);
  expect(ready, `serve did not become ready; stderr:\n${err}`).toBe(true);
  return { roster, backendPidFile };
}

// POSIX-only: these spawn a real MCP backend over stdio and drive shutdown with
// stdin EOF + SIGINT/SIGTERM. On Windows the stdio-spawned backend and Unix
// signal semantics differ (there are no orphaned process-group children to
// reap the same way), and the production shutdown there rides libuv rather than
// this signal orchestration — so the harness is not meaningful on win32.
describe.skipIf(process.platform === "win32")("roster serve shuts down cleanly and never orphans a backend", () => {
  it("exits and reaps the backend on stdin EOF (client disconnect)", async () => {
    const { roster, backendPidFile } = await startServe();
    const backendPid = Number(fs.readFileSync(backendPidFile, "utf8"));
    expect(alive(backendPid)).toBe(true);

    roster.stdin?.end(); // the client disconnects
    const code = await waitExit(roster);
    expect(code).toBe(0);
    expect(await waitFor(() => !alive(backendPid), 8_000), "backend must not be orphaned").toBe(true);
  }, 40_000);

  it("exits and reaps the backend on SIGTERM", async () => {
    const { roster, backendPidFile } = await startServe();
    const backendPid = Number(fs.readFileSync(backendPidFile, "utf8"));
    roster.kill("SIGTERM"); // sent to roster's pid only, NOT the process group
    await waitExit(roster);
    expect(await waitFor(() => !alive(backendPid), 8_000), "backend must not be orphaned").toBe(true);
  }, 40_000);

  it("exits and reaps the backend on SIGINT", async () => {
    const { roster, backendPidFile } = await startServe();
    const backendPid = Number(fs.readFileSync(backendPidFile, "utf8"));
    roster.kill("SIGINT");
    await waitExit(roster);
    expect(await waitFor(() => !alive(backendPid), 8_000), "backend must not be orphaned").toBe(true);
  }, 40_000);

  it("a second shutdown trigger does not hang or error (idempotent)", async () => {
    const { roster, backendPidFile } = await startServe();
    const backendPid = Number(fs.readFileSync(backendPidFile, "utf8"));
    roster.kill("SIGTERM");
    roster.kill("SIGTERM"); // racing/duplicate trigger
    const code = await waitExit(roster);
    expect(code === null || typeof code === "number").toBe(true);
    expect(await waitFor(() => !alive(backendPid), 8_000)).toBe(true);
  }, 40_000);
});
