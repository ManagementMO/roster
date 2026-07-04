#!/usr/bin/env node
// Fake MCP server that initializes fine and lists a tool, but NEVER responds to
// callTool. Exercises the per-task tool-call timeout (task.timeoutMs) path,
// which the runner must classify as an "invoke" failure. argv[2] = a
// package.json to resolve the SDK from; argv[3] = pid marker file.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.argv[2]);
const { Server } = await import(require.resolve("@modelcontextprotocol/sdk/server/index.js"));
const { StdioServerTransport } = await import(require.resolve("@modelcontextprotocol/sdk/server/stdio.js"));
const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
  require.resolve("@modelcontextprotocol/sdk/types.js")
);

if (process.argv[3]) fs.writeFileSync(process.argv[3], String(process.pid));

const server = new Server({ name: "hang-call", version: "0.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name: "slow_op", description: "hangs forever", inputSchema: { type: "object", properties: {} } }],
}));
// Never resolve: the client's per-request timeout must fire.
server.setRequestHandler(CallToolRequestSchema, async () => new Promise(() => {}));
await server.connect(new StdioServerTransport());
