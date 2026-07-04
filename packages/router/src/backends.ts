import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { CallEvidence } from "@rosterhq/coach";
import type { CapabilityEntry } from "@rosterhq/shared";
import { namespacedId, sanitizeSource } from "@rosterhq/shared";

export interface StdioBackendConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Test/embedding hook: attach a backend over any pre-built transport. */
export interface TransportBackendConfig {
  name: string;
  transport: Transport;
}

export type BackendConfig = StdioBackendConfig | TransportBackendConfig;

export interface CallOutcome {
  /** Raw MCP result when the call produced one (including isError results). */
  result: Record<string, unknown> | null;
  evidence: CallEvidence;
  latencyMs: number;
}

const DEFAULT_CALL_TIMEOUT_MS = 30_000;

interface ConnectedBackend {
  name: string;
  client: Client;
  tools: CapabilityEntry[];
}

/**
 * Owns the client connections to every configured MCP backend.
 * Privacy law: this layer never logs args or results — evidence only.
 */
export class BackendManager {
  private backends = new Map<string, ConnectedBackend>();

  constructor(private readonly callTimeoutMs = DEFAULT_CALL_TIMEOUT_MS) {}

  async connect(config: BackendConfig): Promise<CapabilityEntry[]> {
    let name = sanitizeSource(config.name);
    // "skill" is the Playbook's reserved namespace; and two configured names
    // must never silently collapse onto one key after sanitization.
    if (name === "skill") name = "skill-server";
    let suffix = 2;
    const base = name;
    while (this.backends.has(name)) name = `${base}-${suffix++}`;
    const client = new Client({ name: "roster-router", version: "0.0.1" });
    const transport: Transport =
      "transport" in config
        ? config.transport
        : new StdioClientTransport({
            command: config.command,
            args: config.args ?? [],
            // Only explicitly-configured env vars flow through; nothing is persisted or logged.
            env: config.env,
            stderr: "ignore",
          });
    await client.connect(transport);
    const tools = await this.fetchTools(name, client);
    this.backends.set(name, { name, client, tools });
    return tools;
  }

  private async fetchTools(source: string, client: Client): Promise<CapabilityEntry[]> {
    const entries: CapabilityEntry[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools({ cursor });
      for (const tool of page.tools) {
        entries.push({
          id: namespacedId(source, tool.name),
          kind: "tool",
          source,
          name: tool.name,
          description: tool.description ?? "",
          inputSchema: (tool.inputSchema as Record<string, unknown> | undefined) ?? {
            type: "object",
          },
          outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
        });
      }
      cursor = page.nextCursor;
    } while (cursor);
    return entries;
  }

  /** Static snapshot of all backend tools, namespaced (client-compat rule: list never changes mid-session). */
  allTools(): CapabilityEntry[] {
    return [...this.backends.values()].flatMap((b) => b.tools);
  }

  lookup(namespaced: string): { backend: string; toolName: string; entry: CapabilityEntry } | null {
    for (const backend of this.backends.values()) {
      const entry = backend.tools.find((t) => t.id === namespaced);
      if (entry) return { backend: backend.name, toolName: entry.name, entry };
    }
    return null;
  }

  async call(
    backendName: string,
    toolName: string,
    args: Record<string, unknown> | undefined,
    outputSchema?: Record<string, unknown>,
  ): Promise<CallOutcome> {
    const backend = this.backends.get(backendName);
    const started = Date.now();
    if (!backend) {
      return {
        result: null,
        evidence: { transportError: true, errorText: "unknown backend" },
        latencyMs: 0,
      };
    }
    try {
      const result = (await backend.client.callTool(
        { name: toolName, arguments: args ?? {} },
        undefined,
        { timeout: this.callTimeoutMs },
      )) as Record<string, unknown>;
      const latencyMs = Date.now() - started;
      const isError = result.isError === true;
      const evidence: CallEvidence = isError
        ? { isError: true, errorText: extractErrorText(result) }
        : { outputSchemaViolation: violatesOutputSchema(result, outputSchema) };
      return { result, evidence, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - started;
      if (err instanceof McpError) {
        if (err.code === ErrorCode.RequestTimeout) {
          return { result: null, evidence: { timedOut: true }, latencyMs };
        }
        return {
          result: null,
          evidence: { protocolError: true, errorText: err.message },
          latencyMs,
        };
      }
      return {
        result: null,
        evidence: { transportError: true, errorText: err instanceof Error ? err.message : "" },
        latencyMs,
      };
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.backends.values()].map((b) => b.client.close()));
    this.backends.clear();
  }
}

function extractErrorText(result: Record<string, unknown>): string {
  const content = result.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : ""))
    .join(" ")
    .slice(0, 500);
}

/**
 * Structured-output drift check, deliberately shallow in v1: a declared
 * outputSchema with required top-level keys missing from structuredContent
 * is suspicious. Deep validation belongs to the Combine, not the hot path.
 */
function violatesOutputSchema(
  result: Record<string, unknown>,
  outputSchema?: Record<string, unknown>,
): boolean {
  if (!outputSchema) return false;
  const required = outputSchema.required;
  if (!Array.isArray(required) || required.length === 0) return false;
  const structured = result.structuredContent;
  if (structured === undefined || structured === null || typeof structured !== "object") return true;
  return required.some((key) => !(String(key) in (structured as Record<string, unknown>)));
}
