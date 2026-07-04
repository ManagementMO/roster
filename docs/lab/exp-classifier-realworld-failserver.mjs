#!/usr/bin/env node
/**
 * exp-classifier-realworld — minimal REAL MCP stdio server (repo's own
 * @modelcontextprotocol/sdk, low-level Server so payloads are exact).
 * Spawned as a child by the classifier-realworld experiments. Tools:
 *   ok                  → normal success result
 *   echo_error {text}   → { content:[{type:"text",text}], isError:true }  (exact wire payload)
 *   hang                → never resolves (drives client-side call timeout)
 *   die                 → exits the process mid-call (real transport death)
 *   drift_missing_key   → declares outputSchema, returns structuredContent missing the required key
 *   drift_no_structured → declares outputSchema, returns no structuredContent at all
 *   drift_wrong_type    → declares outputSchema, returns structuredContent with wrong value type
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/router/package.json"));
const { Server } = await import(req.resolve("@modelcontextprotocol/sdk/server/index.js"));
const { StdioServerTransport } = await import(
  req.resolve("@modelcontextprotocol/sdk/server/stdio.js")
);
const { ListToolsRequestSchema, CallToolRequestSchema } = await import(
  req.resolve("@modelcontextprotocol/sdk/types.js")
);

const OUTPUT_SCHEMA = {
  type: "object",
  properties: { value: { type: "string" } },
  required: ["value"],
};
const EMPTY_INPUT = { type: "object", properties: {} };

const server = new Server(
  { name: "lab-fail-server", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "ok", description: "always succeeds", inputSchema: EMPTY_INPUT },
    {
      name: "echo_error",
      description: "returns the given text as an isError result",
      inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    },
    { name: "hang", description: "never responds", inputSchema: EMPTY_INPUT },
    { name: "die", description: "kills the server process mid-call", inputSchema: EMPTY_INPUT },
    {
      name: "drift_missing_key",
      description: "structuredContent missing required key",
      inputSchema: EMPTY_INPUT,
      outputSchema: OUTPUT_SCHEMA,
    },
    {
      name: "drift_no_structured",
      description: "no structuredContent despite declared outputSchema",
      inputSchema: EMPTY_INPUT,
      outputSchema: OUTPUT_SCHEMA,
    },
    {
      name: "drift_wrong_type",
      description: "structuredContent with wrong value type",
      inputSchema: EMPTY_INPUT,
      outputSchema: OUTPUT_SCHEMA,
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (reqMsg) => {
  const name = reqMsg.params.name;
  const args = reqMsg.params.arguments ?? {};
  switch (name) {
    case "ok":
      return { content: [{ type: "text", text: "all good" }] };
    case "echo_error":
      return { content: [{ type: "text", text: String(args.text ?? "") }], isError: true };
    case "hang":
      return new Promise(() => {});
    case "die":
      setTimeout(() => process.exit(1), 30);
      return new Promise(() => {});
    case "drift_missing_key":
      return {
        content: [{ type: "text", text: "drifted" }],
        structuredContent: { unexpected: 1 },
      };
    case "drift_no_structured":
      return { content: [{ type: "text", text: "no structured content here" }] };
    case "drift_wrong_type":
      return { content: [{ type: "text", text: "wrong type" }], structuredContent: { value: 123 } };
    default:
      throw new Error(`unknown tool: ${name}`);
  }
});

await server.connect(new StdioServerTransport());
