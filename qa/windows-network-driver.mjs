import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [phase, root, tarball, expectedSha] = process.argv.slice(2);
assert.equal(process.platform, "win32");
const project = path.join(root, "project");
const home = path.join(root, "home");
const temporary = path.join(root, "tmp");
const systemRoot = process.env.SystemRoot;
assert(systemRoot);
const env = { SystemRoot: systemRoot, windir: systemRoot, SystemDrive: process.env.SystemDrive ?? "C:", ComSpec: path.join(systemRoot, "System32", "cmd.exe"), PATHEXT: ".COM;.EXE;.BAT;.CMD", Path: [path.dirname(process.execPath), path.join(systemRoot, "System32")].join(";"), HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData", "Roaming"), LOCALAPPDATA: path.join(home, "AppData", "Local"), TEMP: temporary, TMP: temporary, npm_config_cache: path.join(root, "npm-cache"), npm_config_userconfig: path.join(root, "npmrc"), NO_COLOR: "1" };
const run = (args) => { const result = spawnSync(process.execPath, args, { cwd: project, env, encoding: "utf8", timeout: 600_000 }); assert.equal(result.status, 0, result.stderr); return result; };
const pkg = path.join(project, "node_modules", "@npmmo", "roster");
const bin = path.join(pkg, "bundle", "bin.js");
if (phase === "prepare") {
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(tarball)).digest("hex"), expectedSha);
  for (const dir of [project, home, temporary, env.APPDATA, env.LOCALAPPDATA]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(env.npm_config_userconfig, "registry=https://registry.npmjs.org/\n@npmmo:registry=https://registry.npmjs.org/\naudit=false\nfund=false\n");
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "roster-network-fixture", private: true }));
  const npm = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  run([npm, "install", tarball, "--no-audit", "--no-fund"]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8")).version, "0.0.3");
  console.log(JSON.stringify({ prepared: true, tarballSha256: expectedSha, node: process.version, arch: process.arch }));
} else {
  const req = createRequire(path.join(pkg, "package.json"));
  const { Client } = await import(pathToFileURL(req.resolve("@modelcontextprotocol/sdk/client/index.js")).href);
  const { StdioClientTransport } = await import(pathToFileURL(req.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href);
  const pids = [];
  const modes = [];
  for (const mode of ["transparent", "five"]) {
    const state = path.join(root, mode);
    fs.mkdirSync(state);
    const pidFile = path.join(state, "backend-pid");
    const server = path.join(state, "fixture.mjs");
    fs.writeFileSync(server, `import fs from "node:fs";fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));let b="";const s=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:"2.0",id,result})+"\\n");process.stdin.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))>=0){const l=b.slice(0,i);b=b.slice(i+1);if(!l.trim())continue;const m=JSON.parse(l);if(m.method==="initialize")s(m.id,{protocolVersion:"2025-06-18",capabilities:{tools:{}},serverInfo:{name:"fixture",version:"1"}});else if(m.method==="tools/list")s(m.id,{tools:[{name:"read_value",description:"Read the local fixture value",inputSchema:{type:"object",properties:{}}}]});else if(m.method==="tools/call")s(m.id,{content:[{type:"text",text:"local-fixture-ok"}]});else if(m.id!==undefined)s(m.id,{});}});`);
    fs.writeFileSync(path.join(state, "roster.json"), JSON.stringify({ version: 1, mode, embeddings: "off", telemetry: { enabled: false }, skillSources: [], servers: { fixture: { command: process.execPath, args: [server], importedFrom: ["network-fixture"] } } }));
    const transport = new StdioClientTransport({ command: process.execPath, args: [bin, "serve", `--${mode}`], cwd: project, env: { ...env, ROSTER_HOME: state, ROSTER_NO_FETCH: "1" }, stderr: "ignore" });
    const client = new Client({ name: "network-fixture", version: "1" });
    try {
      await client.connect(transport, { timeout: 30_000 });
      pids.push(transport.pid);
      const tools = await client.listTools();
      assert(tools.tools.length > 0);
      for (let i = 0; i < 3; i++) {
        let called;
        if (mode === "transparent") called = await client.callTool({ name: "fixture__read_value", arguments: {} });
        else {
          const draft = await client.callTool({ name: "draft", arguments: { need: "read the fixture value" } });
          const body = JSON.parse(draft.content.find((part) => part.type === "text").text);
          called = await client.callTool({ name: "call", arguments: { tool: body.starters[0].id, args: {}, draft_id: body.draft_id } });
        }
        assert(!called.isError);
        assert(JSON.stringify(called).includes("local-fixture-ok"));
      }
      pids.push(Number(fs.readFileSync(pidFile, "utf8")));
      modes.push({ mode, calls: 3, status: "PASS" });
    } finally { await client.close(); }
  }
  const positive = run(["-e", 'require("node:https").get("https://registry.npmjs.org/-/ping",r=>{r.resume();r.on("end",()=>process.exit(r.statusCode===200?0:1));}).on("error",()=>process.exit(1));']);
  assert(!pids.includes(positive.pid));
  const report = { status: "PASS", node: process.version, arch: process.arch, pids, positivePid: positive.pid, positiveExit: positive.status, modes };
  fs.writeFileSync(path.join(root, "driver-result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
