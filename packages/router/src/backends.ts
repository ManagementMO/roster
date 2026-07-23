import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { CallEvidence } from "@rosterhq/coach";
import type { CapabilityEntry } from "@rosterhq/shared";
import { stableBackendName, stableNamespacedId } from "@rosterhq/shared";

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
// A backend that spawns but never completes the initialize handshake would
// otherwise hang the whole `roster serve` boot for the SDK's default ~60s —
// per backend, sequentially — stalling the client's entire launch. Bound it.
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_TOOLS = 10_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 2_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  private connecting = new Set<string>();
  private readonly maxTools: number;
  private readonly closeTimeoutMs: number;

  constructor(
    private readonly callTimeoutMs = DEFAULT_CALL_TIMEOUT_MS,
    private readonly connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
    options: { maxTools?: number; closeTimeoutMs?: number } = {},
  ) {
    this.maxTools = options.maxTools ?? DEFAULT_MAX_TOOLS;
    this.closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
  }

  async connect(config: BackendConfig): Promise<CapabilityEntry[]> {
    // The source id is derived from the raw configured name before connecting,
    // so a failed peer cannot change an already-public backend identity.
    const name = stableBackendName(config.name);
    if (this.backends.has(name) || this.connecting.has(name)) {
      throw new Error(`duplicate backend identity: ${name}`);
    }
    this.connecting.add(name);
    // Bound the handshake AND close the spawned child on timeout, so a wedged
    // backend neither hangs boot nor leaks a process.
    let client: Client | undefined;
    try {
      client = new Client({ name: "roster-router", version: "0.0.1" });
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
      await withTimeout(client.connect(transport), this.connectTimeoutMs, "connect timeout");
      const tools = await withTimeout(this.fetchTools(name, client), this.connectTimeoutMs, "listTools timeout");
      this.backends.set(name, { name, client, tools });
      return tools;
    } catch (err) {
      if (client) {
        await withTimeout(client.close(), this.closeTimeoutMs, "close timeout").catch(
          () => undefined,
        );
      }
      throw err;
    } finally {
      this.connecting.delete(name);
    }
  }

  private async fetchTools(source: string, client: Client): Promise<CapabilityEntry[]> {
    const entries: CapabilityEntry[] = [];
    const seenCursors = new Set<string>();
    // Stable raw-name hashing makes sanitizer collisions independently
    // addressable without assigning order-dependent duplicate suffixes.
    let cursor: string | undefined;
    do {
      const page = await client.listTools({ cursor });
      for (const tool of page.tools) {
        const id = stableNamespacedId(source, tool.name);
        entries.push({
          id,
          kind: "tool",
          source,
          name: tool.name,
          description: tool.description ?? "",
          // Preserve title + annotations (incl. readOnlyHint/destructiveHint):
          // transparent mode must be a faithful passthrough, and clients that
          // gate confirmations on destructiveHint need it (audit D1).
          title: typeof tool.title === "string" ? tool.title : undefined,
          annotations: (tool.annotations as Record<string, unknown> | undefined) ?? undefined,
          inputSchema: (tool.inputSchema as Record<string, unknown> | undefined) ?? {
            type: "object",
          },
          outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
          // `execution` (task-support hints) is part of the tool's declared
          // contract; a client that reads it to decide sync-vs-async must see it
          // through the proxy exactly as it would direct (R5-08).
          execution: (tool as { execution?: Record<string, unknown> }).execution ?? undefined,
        });
        if (entries.length > this.maxTools) {
          throw new Error(`backend exposes more than ${this.maxTools} tools`);
        }
      }
      cursor = page.nextCursor;
      if (cursor) {
        if (seenCursors.has(cursor)) throw new Error("tools pagination cursor repeated");
        seenCursors.add(cursor);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
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
      return { result: null, evidence: errorToEvidence(err), latencyMs: Date.now() - started };
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled(
      [...this.backends.values()].map((backend) =>
        withTimeout(backend.client.close(), this.closeTimeoutMs, "close timeout"),
      ),
    );
    this.backends.clear();
  }
}

/**
 * Map a thrown call error to evidence. A server that dies mid-call surfaces as
 * McpError ConnectionClosed (-32000) — that IS a transport death, not a
 * protocol fault, and classifying it as transport also re-arms the Sixth Man
 * (keyed on hard_fail:transport) exactly when a backend crashes. Exported so
 * this mapping is unit-tested without simulating a mid-call transport death.
 */
export function errorToEvidence(err: unknown): CallEvidence {
  if (err instanceof McpError) {
    // Keep the ORIGINAL JSON-RPC code on every branch. Transparent mode's promise
    // is that a proxied error is indistinguishable from a direct one, and a client
    // that branches on `-32001 RequestTimeout` must still see it — the round-4c D3
    // fix preserved the code only for `protocolError`, so timeout and
    // ConnectionClosed were silently rewritten to `-32603 InternalError` (R5-08).
    if (isSdkOutputValidationError(err)) {
      return {
        outputSchemaViolation: true,
        errorText: err.message,
        errorCode: err.code,
      };
    }
    if (err.code === ErrorCode.RequestTimeout) return { timedOut: true, errorCode: err.code };
    if (err.code === ErrorCode.ConnectionClosed) {
      return { transportError: true, errorText: err.message, errorCode: err.code };
    }
    // A raw -32602 is the caller's malformed args (non-attributable, audit M3);
    // other JSON-RPC errors keep their code so transparent mode re-throws it faithfully (D3).
    if (err.code === ErrorCode.InvalidParams) {
      return { inputValidationError: true, errorText: err.message, errorCode: err.code };
    }
    return { protocolError: true, errorText: err.message, errorCode: err.code };
  }
  return { transportError: true, errorText: err instanceof Error ? err.message : "" };
}

function isSdkOutputValidationError(err: McpError): boolean {
  const detail = err.message.replace(/^MCP error -?\d+: /, "");
  return (
    detail.startsWith("Structured content does not match the tool's output schema") ||
    detail.startsWith("Failed to validate structured content") ||
    detail.includes(" has an output schema but did not return structured content")
  );
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
