#!/usr/bin/env node
// Minimal real MCP server over stdio for runner tests: write_file / read_text_file
// rooted at argv[2]. This is a test double, not a product artifact.
import fs from "node:fs";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const root = process.argv[2];
const server = new Server({ name: "fake-fs", version: "0.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "write_file",
      description: "Write content to a file",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
    {
      name: "read_text_file",
      description: "Read a file",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    {
      name: "always_fails",
      description: "Always errors",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = req.params.arguments ?? {};
  const resolve = (p) => (path.isAbsolute(p) ? p : path.join(root, p));
  if (req.params.name === "write_file") {
    const target = resolve(args.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, String(args.content));
    return { content: [{ type: "text", text: `wrote ${args.path}` }] };
  }
  if (req.params.name === "read_text_file") {
    const target = resolve(args.path);
    if (!fs.existsSync(target)) {
      return { isError: true, content: [{ type: "text", text: `not found: ${args.path}` }] };
    }
    return { content: [{ type: "text", text: fs.readFileSync(target, "utf8") }] };
  }
  // The error text deliberately carries the three things a real backend error
  // leaks — a credential, an absolute path, and the caller's own argument — so
  // the privacy test proves a CLASS of leak, not one lucky string (R5-04).
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: "Internal error: always_fails COMBINE_SECRET_MUST_NOT_PERSIST_a1b2c3 (api_key=sk-live-9f7a, path=/Users/private/vault.txt)",
      },
    ],
  };
});

await server.connect(new StdioServerTransport());
