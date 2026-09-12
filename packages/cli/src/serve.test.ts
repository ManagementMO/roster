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
const backendPids = new Set<number>();
afterEach(() => {
  for (const pid of backendPids) {
    if (!alive(pid)) continue;
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
  backendPids.clear();
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
async function startServe(opts: { stubborn?: boolean; initialize?: boolean; badInitialize?: boolean } = {}): Promise<{ roster: ChildProcess; backendPidFile: string; shuttingDown: () => boolean }> {
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
    const { InitializeRequestSchema, ListToolsRequestSchema } = await import(require_.resolve("@modelcontextprotocol/sdk/types.js"));
    const server = new Server({ name: "pidbackend", version: "0.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
    if (${opts.badInitialize === true}) server.setRequestHandler(InitializeRequestSchema, async () => ({
      protocolVersion: "unsupported", capabilities: {}, serverInfo: { name: "pidbackend", version: "0" },
    }));
    if (${opts.stubborn === true}) {
      process.on("SIGTERM", () => {});
      setInterval(() => {}, 1000);
    }
    if (${opts.initialize !== false}) await server.connect(new StdioServerTransport());
    else process.stdin.resume();
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
  const ready = await waitFor(() => (opts.initialize === false || /serving .* in transparent mode/.test(err)) && fs.existsSync(backendPidFile), 20_000);
  expect(ready, `serve did not become ready; stderr:\n${err}`).toBe(true);
  backendPids.add(Number(fs.readFileSync(backendPidFile, "utf8")));
  return { roster, backendPidFile, shuttingDown: () => err.includes("shutting down") };
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

  it.each([true, false])("reaps an uncooperative backend on EOF (initialized: %s)", async (initialize) => {
    const { roster, backendPidFile } = await startServe({ stubborn: true, initialize });
    const backendPid = Number(fs.readFileSync(backendPidFile, "utf8"));
    roster.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shutdown-fixture", version: "1" },
    } })}\n`);
    roster.stdin?.end();
    const exited = await waitFor(() => roster.exitCode !== null || roster.signalCode !== null, 7_000);
    expect(exited, "shutdown must not wait for the pending backend handshake").toBe(true);
    expect(roster.exitCode).toBe(0);
    expect(await waitFor(() => !alive(backendPid), 1_000)).toBe(true);
  }, 15_000);

  it.each([true, false])("keeps handling repeated signals until an uncooperative backend is reaped (initialized: %s)", async (initialize) => {
    const { roster, backendPidFile, shuttingDown } = await startServe({ stubborn: true, initialize });
    const backendPid = Number(fs.readFileSync(backendPidFile, "utf8"));
    roster.kill("SIGTERM");
    expect(await waitFor(shuttingDown, 1_000)).toBe(true);
    roster.kill("SIGTERM");
    expect(await waitFor(() => roster.exitCode !== null || roster.signalCode !== null, 7_000)).toBe(true);
    expect(roster.exitCode).toBe(143);
    expect(await waitFor(() => !alive(backendPid), 1_000)).toBe(true);
  }, 15_000);

  it("waits for SDK-initiated close after a failed initialization", async () => {
    const { roster, backendPidFile } = await startServe({ stubborn: true, badInitialize: true });
    const pid = Number(fs.readFileSync(backendPidFile, "utf8"));
    roster.stdin?.end();
    expect(await waitFor(() => roster.exitCode !== null || roster.signalCode !== null, 7_000)).toBe(true);
    expect(await waitFor(() => !alive(pid), 1_000)).toBe(true);
  }, 15_000);

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
