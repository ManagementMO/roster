import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [mode, root, archive] = process.argv.slice(2);
const project = path.join(root, "project");
const home = path.join(root, "home");
const bin = path.join(project, "node_modules", "@npmmo", "roster", "bundle", "bin.js");
const clientFile = path.join(home, ".cursor", "mcp.json");
const identityFile = path.join(root, "identity.json");
const fixtureFile = path.join(root, "fixture.mjs");
const self = fileURLToPath(import.meta.url);
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, ...options });
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

if (mode === "prepare") {
  assert.notEqual(process.getuid(), 0);
  assert.equal(hash(archive), process.env.CANDIDATE_SHA256);
  for (const dir of [root, project, path.join(home, ".cursor")]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "roster-privacy-probe", version: "0.0.0", private: true }));
  fs.writeFileSync(identityFile, JSON.stringify({ uid: process.getuid(), gid: process.getgid(), user: os.userInfo().username, hostNetwork: fs.readlinkSync("/proc/self/ns/net"), tarballSha256: hash(archive) }));
  fs.writeFileSync(fixtureFile, `
    import { createRequire } from "node:module";
    import { pathToFileURL } from "node:url";
    const require = createRequire(${JSON.stringify(path.join(project, "package.json"))});
    const { Server } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/index.js")).href);
    const { StdioServerTransport } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/stdio.js")).href);
    const { ListToolsRequestSchema, CallToolRequestSchema } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/types.js")).href);
    const server = new Server({ name: "privacy-fixture", version: "1" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [{ name: "ping", description: "Reply with a local pong", inputSchema: { type: "object" } }] }));
    server.setRequestHandler(CallToolRequestSchema, () => ({ content: [{ type: "text", text: JSON.stringify({ reply: "pong", uid: process.getuid() }) }] }));
    await server.connect(new StdioServerTransport());
  `);
  fs.writeFileSync(clientFile, JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [fixtureFile] } } }), { mode: 0o600 });
} else if (mode === "exercise") {
  const identity = JSON.parse(fs.readFileSync(identityFile, "utf8"));
  assert.equal(process.getuid(), identity.uid);
  assert.notEqual(process.getuid(), 0);
  const env = {
    PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(":"),
    HOME: home, USER: identity.user, LOGNAME: identity.user, LANG: "C.UTF-8",
    ROSTER_HOME: path.join(home, ".roster"), ROSTER_TEST_HOME: home,
  };
  const roster = (...args) => run(process.execPath, [bin, ...args], { cwd: project, env });
  const before = hash(clientFile);
  assert.match(roster("init", "--no-dense"), /Day-0 receipt/);
  assert.match(roster("receipt"), /Day-0 receipt/);
  assert.match(roster("telemetry", "status"), /OFF/);
  const config = JSON.parse(fs.readFileSync(path.join(env.ROSTER_HOME, "roster.json"), "utf8"));
  assert.equal(config.telemetry.enabled, false);
  assert.equal(fs.existsSync(path.join(env.ROSTER_HOME, "runtime")), false);
  roster("sync", "--client", "cursor");
  const entry = JSON.parse(fs.readFileSync(clientFile, "utf8")).mcpServers.roster;
  const require = createRequire(path.join(project, "package.json"));
  const { Client } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/index.js")).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href);
  for (const five of [false, true]) {
    const client = new Client({ name: "privacy-probe", version: "1" });
    try {
      await client.connect(new StdioClientTransport({ command: entry.command, args: [...entry.args, ...(five ? ["--five"] : [])], env, stderr: "ignore" }), { timeout: 10_000 });
      const tools = (await client.listTools()).tools.map((tool) => tool.name);
      let result;
      if (five) {
        assert.deepEqual(tools.sort(), ["call", "draft"]);
        const draft = await client.callTool({ name: "draft", arguments: { need: "Reply with a local pong" } });
        const payload = JSON.parse(draft.content[0].text);
        assert(payload.starters.some((starter) => starter.id === "fixture__ping"));
        result = await client.callTool({ name: "call", arguments: { tool: "fixture__ping", args: {}, draft_id: payload.draft_id } });
      } else {
        assert(tools.includes("fixture__ping"));
        result = await client.callTool({ name: "fixture__ping", arguments: {} });
      }
      const reply = JSON.parse(result.content.find((item) => item.type === "text").text);
      assert.deepEqual(reply, { reply: "pong", uid: identity.uid });
    } finally {
      await client.close();
    }
  }
  roster("eject", "--client", "cursor");
  assert.equal(hash(clientFile), before);
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.ROSTER_HOME, "roster.json"), "utf8")).telemetry.enabled, false);
  process.stdout.write(JSON.stringify({ uid: process.getuid(), telemetry: "off", modes: ["transparent", "five"], restored: true }));
} else if (mode === "capture") {
  const identity = JSON.parse(fs.readFileSync(identityFile, "utf8"));
  assert.equal(process.getuid(), 0);
  const namespace = fs.readlinkSync("/proc/self/ns/net");
  assert.notEqual(namespace, identity.hostNetwork, "refusing to capture the host network");
  const interfaces = JSON.parse(run("ip", ["-j", "link", "show"]));
  assert(interfaces.length === 1 && interfaces[0].ifname === "lo", "expected a fresh private network namespace");
  run("ip", ["link", "set", "lo", "up"]);
  const startCapture = async (file) => {
    const child = spawn("tcpdump", ["-U", "-i", "any", "-nn", "-Z", "root", "-w", file], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    const deadline = Date.now() + 5_000;
    while (!stderr.includes("listening on")) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(`tcpdump failed to become ready: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return async () => {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill("SIGINT");
      assert.equal(await closed, 0);
    };
  };
  const canary = path.join(root, "canary.pcap");
  const stopCanary = await startCapture(canary);
  const server = http.createServer((_request, response) => response.end("capture-control"));
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/canary`);
    assert.equal(await response.text(), "capture-control");
    const deadline = Date.now() + 5_000;
    while (fs.statSync(canary).size <= 24) {
      if (Date.now() > deadline) throw new Error("canary packets were not captured");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await stopCanary();
  }
  const canaryPackets = run("tcpdump", ["-nn", "-r", canary]).trim().split("\n").filter(Boolean);
  assert(canaryPackets.length > 0, "packet capture positive control failed");
  const capture = path.join(root, "default-off.pcap");
  const stop = await startCapture(capture);
  let exercise;
  try {
    exercise = JSON.parse(run("setpriv", [`--reuid=${identity.uid}`, `--regid=${identity.gid}`, "--clear-groups", process.execPath, self, "exercise", root], { cwd: project, timeout: 120_000 }));
  } finally {
    await stop();
  }
  const packets = run("tcpdump", ["-nn", "-r", capture]).trim().split("\n").filter(Boolean);
  assert.equal(packets.length, 0, "unexpected network packets during default-off CLI/MCP exercise");
  const report = { ...identity, captureUid: process.getuid(), networkNamespace: namespace, node: process.version, exercise, canaryPackets: canaryPackets.length, productPackets: packets.length, completedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(root, "capture-summary.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} else {
  throw new Error("expected prepare, exercise, or capture mode");
}
