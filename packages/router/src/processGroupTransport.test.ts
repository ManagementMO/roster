import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProcessGroupTransport } from "./processGroupTransport.js";

let home: string;
const transports: ProcessGroupTransport[] = [];
const descendants = new Set<number>();

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    if (process.platform === "linux") {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      return stat[stat.lastIndexOf(")") + 2] !== "Z";
    }
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("fixture did not reach the expected state");
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}

function transport(code: string, env?: Record<string, string>): ProcessGroupTransport {
  const result = new ProcessGroupTransport({ command: process.execPath, args: ["-e", code], env, stderr: "ignore" });
  transports.push(result);
  return result;
}

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), "roster-process-group-")); });
afterEach(async () => {
  await Promise.allSettled(transports.splice(0).map((item) => item.close()));
  for (const pid of descendants) {
    if (running(pid)) {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  }
  descendants.clear();
  fs.rmSync(home, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("process-group MCP transport", () => {
  it("preserves framed messages and explicit environment without inheriting an ambient secret", async () => {
    const previous = process.env.ROSTER_AMBIENT_TEST_SECRET;
    process.env.ROSTER_AMBIENT_TEST_SECRET = "must-not-reach-backend";
    const peer = transport(`
      process.stdin.setEncoding("utf8");
      let input = "";
      process.stdin.on("data", chunk => {
        input += chunk;
        if (!input.includes("\\n")) return;
        const request = JSON.parse(input.slice(0, input.indexOf("\\n")));
        input = "";
        const reply = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {
          value: request.params.value,
          explicit: process.env.ROSTER_CONFIGURED_TEST_VALUE,
          inheritedSecret: process.env.ROSTER_AMBIENT_TEST_SECRET !== undefined,
        } }) + "\\n");
        process.stdout.write("not-json\\n");
        process.stdout.write(reply.subarray(0, 7));
        setTimeout(() => process.stdout.write(reply.subarray(7)), 25);
      });
    `, { ROSTER_CONFIGURED_TEST_VALUE: "configured" });
    const errors: Error[] = [];
    peer.onerror = (error) => errors.push(error);
    const received = new Promise<JSONRPCMessage>((resolve) => { peer.onmessage = resolve; });
    try {
      await peer.start();
      await peer.send({ jsonrpc: "2.0", id: 11, method: "echo", params: { value: "résumé" } });
      expect(await received).toEqual({ jsonrpc: "2.0", id: 11, result: {
        value: "résumé", explicit: "configured", inheritedSecret: false,
      } });
      expect(errors).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env.ROSTER_AMBIENT_TEST_SECRET;
      else process.env.ROSTER_AMBIENT_TEST_SECRET = previous;
    }
  });

  it("reports a spawn failure and closes once even when close is requested repeatedly", async () => {
    const peer = new ProcessGroupTransport({ command: path.join(home, "missing-command"), stderr: "ignore" });
    transports.push(peer);
    let closed = 0;
    peer.onclose = () => { closed++; };
    await expect(peer.start()).rejects.toMatchObject({ code: "ENOENT" });
    await Promise.all([peer.close(), peer.close()]);
    expect(closed).toBe(1);
    await expect(peer.send({ jsonrpc: "2.0", id: 1, method: "ping" })).rejects.toThrow("Not connected");
  });

  it("cleans up a descendant when the backend exits before an explicit close", async () => {
    const pidFile = path.join(home, "descendant.pid");
    const exitFile = path.join(home, "exit");
    const childCode = `process.on("SIGTERM", () => {}); setInterval(() => {}, 1000); require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`;
    const peer = transport(`
      const fs = require("node:fs");
      require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(childCode)}], { stdio: "ignore" });
      setInterval(() => { if (fs.existsSync(${JSON.stringify(exitFile)})) process.exit(0); }, 20);
    `);
    const closed = new Promise<void>((resolve) => { peer.onclose = resolve; });
    await peer.start();
    await waitFor(() => fs.existsSync(pidFile));
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    descendants.add(pid);
    expect(running(pid)).toBe(true);
    fs.writeFileSync(exitFile, "exit");
    await closed;
    await waitFor(() => !running(pid));
  });
});
