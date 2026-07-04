#!/usr/bin/env node
/**
 * A REAL MCP stdio server exposing the 133 shared-corpus tool cards
 * (docs/lab/corpus.mjs) — real process, real protocol, official SDK. Used by
 * exp-proxy-tax-c-cold-boot.mjs so `roster serve` can front a 133-tool roster
 * the way it fronts any backend. Tool calls echo their args (real execution).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "./corpus.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sdkRequire = createRequire(path.join(repo, "packages/router/package.json"));
const { Server } = await import(sdkRequire.resolve("@modelcontextprotocol/sdk/server/index.js"));
const { StdioServerTransport } = await import(
  sdkRequire.resolve("@modelcontextprotocol/sdk/server/stdio.js")
);
const { ListToolsRequestSchema, CallToolRequestSchema } = await import(
  sdkRequire.resolve("@modelcontextprotocol/sdk/types.js")
);

const server = new Server({ name: "corpus", version: "0.0.1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    // roster namespaces by backend name; serve the bare tool name so ids come
    // out as corpus__<name>. 133 distinct names exist across sources; suffix
    // duplicates deterministically to keep the full 133 visible.
    name: t.id.replace("__", "_"),
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => ({
  content: [{ type: "text", text: JSON.stringify({ echoed: req.params.arguments ?? {} }) }],
}));

await server.connect(new StdioServerTransport());
