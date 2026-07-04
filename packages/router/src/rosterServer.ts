import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { CoachStore } from "@rosterhq/coach";
import { classifyOutcome, hashArgs, hashNeed } from "@rosterhq/coach";
import type { ParsedSkill } from "@rosterhq/playbook";
import { skillInvocationResult, skillToCapabilityEntry } from "@rosterhq/playbook";
import type { CapabilityEntry, OutcomeClass } from "@rosterhq/shared";
import type { BackendManager } from "./backends.js";
import { toCard } from "./cards.js";

export type RouterMode = "transparent" | "five";

export interface RosterServerOptions {
  mode: RouterMode;
  manager: BackendManager;
  store: CoachStore;
  skills?: ParsedSkill[];
  /** Optional dense rung: resolves a need to a vector when the embedder is ready. */
  embedNeed?: (need: string) => Promise<Float32Array | null>;
  defaultK?: number;
  sessionId?: string;
}

interface DraftCache {
  need: string;
  needHash: string;
  rankedIds: string[];
}

const SUGGESTION_CLASSES: ReadonlySet<OutcomeClass> = new Set([
  "hard_fail:transport",
  "tool_fail:timeout",
  "tool_fail:internal",
]);

const DRAFT_TOOL = {
  name: "draft",
  description:
    "Describe the next thing you need to do. Returns the best ≤K capabilities (the starting five) for it — tools and skills. Call again whenever your need changes.",
  inputSchema: {
    type: "object",
    properties: {
      need: { type: "string", description: "plain-language description of the immediate task" },
      k: { type: "integer", minimum: 1, maximum: 10, default: 5 },
    },
    required: ["need"],
  },
} as const;

const CALL_TOOL = {
  name: "call",
  description:
    "Invoke a drafted capability by its full id. Tools execute; skills return their instructions.",
  inputSchema: {
    type: "object",
    properties: {
      tool: { type: "string", description: "namespaced id, e.g. github__create_issue" },
      args: { type: "object" },
      draft_id: { type: "string", description: "the draft this call belongs to (from draft's response)" },
    },
    required: ["tool"],
  },
} as const;

/**
 * The Rotation. One MCP server fronting every backend.
 * - transparent: static namespaced re-export, byte-faithful passthrough, outcomes logged.
 * - five: draft/call meta-tools — the client-visible tool list never changes,
 *   which is exactly why roster substitution works on every client.
 */
export class RosterServer {
  readonly server: Server;
  private readonly mode: RouterMode;
  private readonly manager: BackendManager;
  private readonly store: CoachStore;
  private readonly skills: Map<string, ParsedSkill>;
  private readonly embedNeed?: (need: string) => Promise<Float32Array | null>;
  private readonly defaultK: number;
  private readonly sessionId: string;
  // 2020-12 is MCP's schema dialect; plain Ajv can't compile it and every
  // args_compatible would silently read false.
  private readonly ajv = new Ajv2020({ strict: false });
  /** Recent drafts by id — parallel draft/call pairs must not cross-attribute. */
  private readonly drafts = new Map<string, DraftCache>();
  private lastDraftId: string | null = null;
  private draftCounter = 0;

  constructor(opts: RosterServerOptions) {
    this.mode = opts.mode;
    this.manager = opts.manager;
    this.store = opts.store;
    this.embedNeed = opts.embedNeed;
    this.defaultK = opts.defaultK ?? 5;
    this.sessionId = opts.sessionId ?? randomUUID();
    this.skills = new Map(
      (opts.skills ?? []).map((s) => [skillToCapabilityEntry(s).id, s] as const),
    );

    this.server = new Server(
      { name: "roster", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.listTools(),
    }));
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (this.mode === "transparent") {
        return this.handleTransparentCall(
          request.params.name,
          request.params.arguments as Record<string, unknown> | undefined,
        );
      }
      if (request.params.name === "draft") {
        return this.handleDraft(request.params.arguments as { need?: string; k?: number } | undefined);
      }
      if (request.params.name === "call") {
        return this.handleFiveCall(
          request.params.arguments as { tool?: string; args?: Record<string, unknown> } | undefined,
        );
      }
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    });
  }

  /**
   * Index everything the router fronts (drift detection) and prune ghosts.
   * Pass the sources that are configured but unreachable this boot — their
   * capabilities are preserved, not pruned (transient outage ≠ removal).
   */
  syncCapabilities(unavailableSources: ReadonlySet<string> = new Set()): void {
    const entries: CapabilityEntry[] = [
      ...this.manager.allTools(),
      ...[...this.skills.values()].map(skillToCapabilityEntry),
    ];
    this.store.upsertCapabilities(entries);
    this.store.pruneMissing(new Set(entries.map((e) => e.id)), unavailableSources);
  }

  private listTools(): Array<Record<string, unknown>> {
    if (this.mode === "five") {
      return [DRAFT_TOOL as unknown as Record<string, unknown>, CALL_TOOL as unknown as Record<string, unknown>];
    }
    return this.manager.allTools().map((entry) => ({
      name: entry.id,
      description: entry.description,
      inputSchema: entry.inputSchema ?? { type: "object" },
      ...(entry.outputSchema ? { outputSchema: entry.outputSchema } : {}),
    }));
  }

  // ── transparent mode ─────────────────────────────────────────────────────

  private async handleTransparentCall(
    namespacedName: string,
    args: Record<string, unknown> | undefined,
  ): Promise<Record<string, unknown>> {
    const target = this.manager.lookup(namespacedName);
    if (!target) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${namespacedName}`);
    }
    const entry = this.manager
      .allTools()
      .find((t) => t.id === namespacedName);
    const outcome = await this.manager.call(
      target.backend,
      target.toolName,
      args,
      entry?.outputSchema,
    );
    this.record(namespacedName, target.backend, outcome.evidence, outcome.latencyMs, args, null);
    if (outcome.result) return outcome.result;
    // Transparent means transparent: protocol/transport failures surface as
    // protocol errors, exactly as a direct connection would show them —
    // never repackaged into a "successful" isError result.
    if (outcome.evidence.protocolError) {
      throw new McpError(ErrorCode.InternalError, outcome.evidence.errorText ?? "backend protocol error");
    }
    throw new McpError(
      ErrorCode.InternalError,
      describeFailure(outcome.evidence),
    );
  }

  // ── five mode ────────────────────────────────────────────────────────────

  private async handleDraft(
    args: { need?: string; k?: number } | undefined,
  ): Promise<Record<string, unknown>> {
    const need = (args?.need ?? "").trim();
    if (need === "") {
      throw new McpError(ErrorCode.InvalidParams, "draft requires a non-empty `need`");
    }
    const k = clampK(args?.k ?? this.defaultK);
    const needHash = hashNeed(need);

    let needVec: Float32Array | null = null;
    if (this.embedNeed) {
      try {
        needVec = await this.embedNeed(need);
        if (needVec) this.store.storeNeedVec(needHash, needVec);
      } catch {
        needVec = null; // dense rung is optional by design; lexical always serves
      }
    }

    const candidates = this.store.draftCandidates(need, k, needVec);
    const draftId = `d${++this.draftCounter}`;
    this.drafts.set(draftId, { need, needHash, rankedIds: candidates.map((c) => c.entry.id) });
    this.lastDraftId = draftId;
    if (this.drafts.size > 16) {
      const oldest = this.drafts.keys().next().value;
      if (oldest) this.drafts.delete(oldest);
    }
    const starters = candidates.map((c) => toCard(c.entry));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              need,
              draft_id: draftId,
              starters,
              usage:
                "Invoke with call({tool: <id>, args: {…}, draft_id}). Re-draft when your need changes.",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  private async handleFiveCall(
    args: { tool?: string; args?: Record<string, unknown>; draft_id?: string } | undefined,
  ): Promise<Record<string, unknown>> {
    const id = args?.tool ?? "";
    const callArgs = args?.args;
    if (id === "") throw new McpError(ErrorCode.InvalidParams, "call requires `tool`");
    // Strict attribution: an explicitly-provided-but-unknown draft_id must
    // NEVER fall back to someone else's draft (that was the cross-attribution
    // bug this map exists to close). Fallback applies only when omitted.
    const draft = args?.draft_id
      ? (this.drafts.get(args.draft_id) ?? null)
      : this.lastDraftId
        ? (this.drafts.get(this.lastDraftId) ?? null)
        : null;

    const skill = id.startsWith("skill__") ? this.skills.get(id) : undefined;
    if (skill) {
      this.record(id, "skill", {}, 0, callArgs, draft?.needHash ?? null);
      return {
        content: [
          { type: "text", text: JSON.stringify(skillInvocationResult(skill), null, 2) },
        ],
      };
    }

    const target = this.manager.lookup(id);
    if (!target) throw new McpError(ErrorCode.InvalidParams, `Unknown capability: ${id}`);
    const entry = this.manager.allTools().find((t) => t.id === id);
    const outcome = await this.manager.call(target.backend, target.toolName, callArgs, entry?.outputSchema);
    const cls = this.record(
      id,
      target.backend,
      outcome.evidence,
      outcome.latencyMs,
      callArgs,
      draft?.needHash ?? null,
    );

    const base = outcome.result ?? errorResult(describeFailure(outcome.evidence));
    if (base.isError === true && SUGGESTION_CLASSES.has(cls)) {
      const suggestion = this.sixthManSuggestion(draft, id, callArgs);
      if (suggestion) {
        // Field data gating post-launch auto-substitution: every suggestion is
        // logged; the store flips `taken` if the agent follows it.
        this.store.recordSuggestion(this.sessionId, id, suggestion.tool);
        const content = Array.isArray(base.content) ? [...base.content] : [];
        content.push({
          type: "text",
          text: JSON.stringify({ _roster: { suggested_alternate: suggestion } }),
        });
        return { ...base, content };
      }
    }
    return base;
  }

  /**
   * Sixth Man — SUGGEST-ONLY (owner decision 2026-07-04). Roster never
   * auto-fires a second tool; the agent decides. args_compatible tells it
   * whether its args validate against the alternate's schema as-is.
   */
  private sixthManSuggestion(
    draft: DraftCache | null,
    failedId: string,
    args: Record<string, unknown> | undefined,
  ): { tool: string; reason: string; args_compatible: boolean } | null {
    if (!draft) return null;
    const failedSource = failedId.split("__")[0];
    for (const candidateId of draft.rankedIds) {
      if (candidateId === failedId) continue;
      if (candidateId.split("__")[0] === failedSource) continue;
      if (this.skills.has(candidateId)) continue;
      const entry = this.manager.allTools().find((t) => t.id === candidateId);
      if (!entry) continue;
      let compatible = false;
      try {
        if (entry.inputSchema) {
          // Strip $schema: backends declare draft-07 or 2020-12 dialects; we
          // validate STRUCTURE only, and a dialect ref must not throw us into
          // a false "incompatible".
          const { $schema: _dialect, ...schema } = entry.inputSchema;
          compatible = this.ajv.validate(schema, args ?? {}) as boolean;
        }
      } catch {
        compatible = false;
      }
      return {
        tool: candidateId,
        reason: `the bench suggests ${candidateId} for the same need ("${draft.need}")`,
        args_compatible: compatible,
      };
    }
    return null;
  }

  // ── shared ───────────────────────────────────────────────────────────────

  private record(
    capability: string,
    source: string,
    evidence: Parameters<typeof classifyOutcome>[0],
    latencyMs: number,
    args: unknown,
    needHash: string | null,
  ): OutcomeClass {
    const outcomeClass = classifyOutcome(evidence);
    this.store.recordOutcome({
      session: this.sessionId,
      source,
      capability,
      outcomeClass,
      latencyMs,
      argsHash: hashArgs(args),
      needHash,
    });
    return outcomeClass;
  }
}

function clampK(k: unknown): number {
  const n = typeof k === "number" && Number.isFinite(k) ? Math.round(k) : 5;
  return Math.max(1, Math.min(10, n));
}

function errorResult(message: string): Record<string, unknown> {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function describeFailure(evidence: { transportError?: boolean; timedOut?: boolean; errorText?: string }): string {
  if (evidence.timedOut) return "call timed out";
  if (evidence.transportError) return `backend unreachable${evidence.errorText ? `: ${evidence.errorText}` : ""}`;
  return evidence.errorText || "call failed";
}
