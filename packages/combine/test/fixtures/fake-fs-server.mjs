#!/usr/bin/env node
// Minimal real MCP server over stdio for runner tests: write_file / read_text_file
// rooted at argv[2]. This is a test double, not a product artifact.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const root = process.argv[2];
const externalDirectories = new Set();
const restrictedDirectories = new Set();
const server = new Server({ name: "fake-fs", version: "0.0.0" }, { capabilities: { tools: {} } });

process.on("exit", () => {
  for (const directory of restrictedDirectories) {
    try {
      fs.chmodSync(directory, 0o700);
    } catch {
      // Best-effort test-fixture cleanup; the runner removes the sandbox.
    }
  }
  for (const directory of externalDirectories) fs.rmSync(directory, { recursive: true, force: true });
});

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
    {
      name: "create_external_symlink",
      description: "Create a sandbox symlink to a file outside the sandbox",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    {
      name: "create_dangling_symlink",
      description: "Create a dangling sandbox symlink",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    {
      name: "create_restricted_entry",
      description: "Create a visible entry in a non-searchable directory",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    {
      name: "create_fifo",
      description: "Create a named pipe (FIFO) with no writer at the path",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    {
      name: "get_file_info",
      description: "Stat a file (mirrors @modelcontextprotocol/server-filesystem output format)",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
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
  if (req.params.name === "create_external_symlink") {
    const target = resolve(args.path);
    const externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "combine-external-"));
    externalDirectories.add(externalDirectory);
    const externalTarget = path.join(externalDirectory, "target.txt");
    fs.writeFileSync(externalTarget, "external target");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(externalTarget, target);
    return { content: [{ type: "text", text: `linked ${args.path}` }] };
  }
  if (req.params.name === "create_dangling_symlink") {
    const target = resolve(args.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(path.join(root, "missing-target"), target);
    return { content: [{ type: "text", text: `linked ${args.path}` }] };
  }
  if (req.params.name === "create_restricted_entry") {
    const directory = resolve(args.path);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(directory, "observed"), "present");
    fs.chmodSync(directory, 0o400);
    restrictedDirectories.add(directory);
    return { content: [{ type: "text", text: "created restricted entry" }] };
  }
  if (req.params.name === "create_fifo") {
    // A named pipe with no writer: fs.readFileSync opens it BLOCKING and hangs
    // the verify phase forever. Node has no mkfifo, so shell out (POSIX-only,
    // which is fine for the Linux CI this fixture targets).
    const target = resolve(args.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    execFileSync("mkfifo", [target]);
    return { content: [{ type: "text", text: `created fifo ${args.path}` }] };
  }
  if (req.params.name === "get_file_info") {
    // Byte-for-byte the official server's shape: `${key}: ${value}` per line,
    // size FIRST as a bare integer. This is what the tightened suite assertion
    // ("size: <bytes>\n...") certifies against (L10).
    const stats = fs.statSync(resolve(args.path));
    const info = {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      permissions: (stats.mode & 0o777).toString(8).padStart(3, "0"),
    };
    const text = Object.entries(info)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    return { content: [{ type: "text", text }] };
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
