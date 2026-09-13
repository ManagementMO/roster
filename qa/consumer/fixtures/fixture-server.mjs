#!/usr/bin/env node
// Test-owned MCP stdio backend fixture (no dependencies). Behaviour is driven
// by argv / env so the harness can exercise pagination, output-schema
// validation, structured errors, description drift, slow startup, an
// uncooperative shutdown, and a spawned descendant (process-tree cleanup).
//
//   argv[2]  marker string (present in the command line so the harness can find
//            the process tree afterwards)
// env:
//   FIXTURE_DRIFT=1            change the description of `stable_tool`
//   FIXTURE_SLOW_START_MS=n    delay the initialize response by n ms
//   FIXTURE_IGNORE_TERM=1      ignore SIGTERM/SIGINT and stdin EOF (uncooperative)
//   FIXTURE_CHILD=1            spawn a long-lived descendant (node) carrying the marker
//   FIXTURE_REPEAT_CURSOR=1    return the same nextCursor forever (pagination loop)
//   FIXTURE_STATE_FILE=path    append one line per event (initialize/exit) for evidence
import fs from "node:fs";
import { spawn } from "node:child_process";

const marker = process.argv[2] ?? "no-marker";
const env = process.env;
const log = (line) => {
  if (env.FIXTURE_STATE_FILE) fs.appendFileSync(env.FIXTURE_STATE_FILE, `${Date.now()} ${process.pid} ${line}\n`);
};
log(`start ${marker}`);

let child = null;
if (env.FIXTURE_CHILD === "1") {
  child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", "--", `${marker}-descendant`], {
    stdio: "ignore",
    // Deliberately NOT detached: a cooperative fixture would reap this itself.
  });
  log(`descendant ${child.pid}`);
}

const uncooperative = env.FIXTURE_IGNORE_TERM === "1";
if (uncooperative) {
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    try { process.on(sig, () => log(`ignored ${sig}`)); } catch { /* win32 */ }
  }
}

const tools = [
  {
    name: "stable_tool",
    description: env.FIXTURE_DRIFT === "1" ? "DRIFTED description of stable tool" : "Stable tool used for drift detection",
    inputSchema: { type: "object", properties: { x: { type: "string" } } },
  },
  {
    name: "schema_ok",
    description: "returns structured content that matches its output schema",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", required: ["answer"], properties: { answer: { type: "integer" } } },
  },
  {
    name: "schema_bad",
    description: "returns structured content that VIOLATES its output schema",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", required: ["answer"], properties: { answer: { type: "integer" } } },
  },
  {
    name: "schema_missing",
    description: "has an output schema but returns no structured content",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", required: ["answer"], properties: { answer: { type: "integer" } } },
  },
  {
    name: "error_with_data",
    description: "raises a JSON-RPC error whose data carries a synthetic marker",
    inputSchema: { type: "object", properties: { marker: { type: "string" } } },
  },
  {
    name: "tool_error",
    description: "returns isError:true content",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "echo",
    description: "echoes its arguments as text",
    inputSchema: { type: "object", properties: { text: { type: "string" } } },
  },
  {
    name: "page2_tool",
    description: "only reachable through the second page of tools/list",
    inputSchema: { type: "object", properties: {} },
  },
];
const PAGE = 5;

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (line) handle(line);
  }
});
process.stdin.on("end", () => {
  log("stdin-eof");
  if (!uncooperative) exit(0);
});

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}
function result(id, res) { send({ jsonrpc: "2.0", id, result: res }); }
function error(id, code, message, data) { send({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } }); }

function handle(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === undefined) return; // response to our own (none)
  if (msg.method === "initialize") {
    const reply = () => {
      log("initialized");
      result(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "roster-qa-fixture", version: "0.0.0" },
      });
    };
    const delay = Number(env.FIXTURE_SLOW_START_MS ?? 0);
    if (delay > 0) setTimeout(reply, delay); else reply();
    return;
  }
  if (msg.method === "notifications/initialized") return;
  if (msg.method === "ping") return result(msg.id, {});
  if (msg.method === "tools/list") {
    const cursor = msg.params?.cursor;
    if (env.FIXTURE_REPEAT_CURSOR === "1") {
      return result(msg.id, { tools: tools.slice(0, PAGE), nextCursor: "loop" });
    }
    const start = cursor ? Number(cursor) : 0;
    const slice = tools.slice(start, start + PAGE);
    const res = { tools: slice };
    if (start + PAGE < tools.length) res.nextCursor = String(start + PAGE);
    return result(msg.id, res);
  }
  if (msg.method === "tools/call") {
    const name = msg.params?.name;
    const args = msg.params?.arguments ?? {};
    switch (name) {
      case "stable_tool": return result(msg.id, { content: [{ type: "text", text: `stable:${args.x ?? ""}` }] });
      case "schema_ok": return result(msg.id, { content: [{ type: "text", text: "{\"answer\":42}" }], structuredContent: { answer: 42 } });
      case "schema_bad": return result(msg.id, { content: [{ type: "text", text: "{\"answer\":\"forty-two\"}" }], structuredContent: { answer: "forty-two" } });
      case "schema_missing": return result(msg.id, { content: [{ type: "text", text: "no structured content" }] });
      case "error_with_data": return error(msg.id, -32000, "fixture failure", { marker: args.marker ?? "none", detail: "synthetic error.data payload" });
      case "tool_error": return result(msg.id, { isError: true, content: [{ type: "text", text: "fixture tool error" }] });
      case "echo": return result(msg.id, { content: [{ type: "text", text: `echo:${args.text ?? ""}` }] });
      case "page2_tool": return result(msg.id, { content: [{ type: "text", text: "page2 ok" }] });
      default: return error(msg.id, -32602, `unknown tool ${name}`);
    }
  }
  if (msg.id !== undefined) error(msg.id, -32601, `method not found: ${msg.method}`);
}

function exit(code) {
  log(`exit ${code}`);
  if (child && !child.killed) { try { child.kill(); } catch { /* ignore */ } }
  process.exit(code);
}
process.on("exit", () => log("process-exit"));
