import type { OutcomeClass, ToolFailKind } from "@rosterhq/shared";

/**
 * Everything the router observed about one call — and nothing more.
 * No args, no results, no prompts ever reach the classifier.
 */
export interface CallEvidence {
  /** Connection died / server unreachable / stream broke. */
  transportError?: boolean;
  /** JSON-RPC level error (e.g. -32601 method not found). */
  protocolError?: boolean;
  /** The original JSON-RPC error code, preserved so transparent mode can re-throw it faithfully. */
  errorCode?: number;
  /** The call exceeded its deadline. */
  timedOut?: boolean;
  /** MCP result carried isError: true. */
  isError?: boolean;
  /** A raw JSON-RPC -32602 Invalid params — a CALLER-side arg fault (see classifyOutcome). */
  inputValidationError?: boolean;
  /** Error text from the isError result — used only for kind heuristics, never stored. */
  errorText?: string;
  /** Result failed validation against the tool's declared outputSchema. */
  outputSchemaViolation?: boolean;
}

/**
 * Handoff §6.2, exact precedence. Rule 4 (soft_fail on retry-with-modified-args)
 * is a post-hoc marker applied by the store, not a class.
 */
export function classifyOutcome(e: CallEvidence): OutcomeClass {
  if (e.transportError) return "hard_fail:transport";
  if (e.protocolError) return "hard_fail:protocol";
  if (e.timedOut) return "tool_fail:timeout";
  // A raw-wire -32602 is the caller's malformed args, not a tool defect — same
  // carve-out §8 makes for isError-folded validation errors. Without this, a
  // legacy/raw-wire server got Wilson-dinged for the agent's mistake while a
  // modern server (which folds -32602 into isError text) did not (audit M3).
  if (e.inputValidationError) return "tool_fail:schema";
  if (e.isError) return `tool_fail:${classifyToolFailKind(e.errorText ?? "")}`;
  if (e.outputSchemaViolation) return "schema_drift_suspect";
  return "success";
}

/**
 * Heuristic taxonomy aligned with MCP-Atlas categories. Order encodes precedence:
 * auth before schema ("invalid token" is auth, not schema); and INTERNAL before
 * schema, because `tool_fail:schema` is non-attributable — a genuine 500/panic
 * whose text merely contains a schema-ish word ("internal validation error")
 * must classify as the tool's internal fault, not be excused as a caller error.
 */
export function classifyToolFailKind(errorText: string): ToolFailKind {
  const t = errorText.toLowerCase();
  if (/time.?out|timed out|deadline|etimedout/.test(t)) return "timeout";
  // quota BEFORE auth: "30000 tokens per min" / "Authenticated requests get a
  // higher rate limit" are quota messages that the bare `token`/`auth` word
  // would otherwise misroute to auth (audit M4). Order encodes precedence.
  if (/quota|rate.?limit|too many requests|\b429\b|tokens?\s+per\b|per\s+(minute|min|second|sec|hour|day)\b/.test(t)) {
    return "quota";
  }
  if (/internal (server )?error|\b500\b|panic|crashed|segfault/.test(t)) return "internal";
  // schema (caller-side, non-attributable) BEFORE auth so "invalid token format
  // in 'path' argument" lands here, not on the `token` in auth. Best-effort by
  // construction; the precise fix is P7(c) — validate args against inputSchema.
  if (
    /schema|invalid (argument|param|input|request)|validation|required (field|property|parameter)|must be of type|invalid\b[\w\s'"()-]{0,40}\b(format|argument|parameter|value|type|field|property)\b/.test(
      t,
    )
  ) {
    return "schema";
  }
  if (
    /unauthori[sz]ed|forbidden|permission denied|credential|api.?key|signature|invalid_auth|not_authed|authentication|token|\b401\b|\b403\b|\bauth/.test(
      t,
    )
  ) {
    return "auth";
  }
  return "other";
}

/**
 * Only these classes may ever feed a rating; soft_fail and explored rows never
 * do. `tool_fail:schema` is deliberately EXCLUDED: an input-validation rejection
 * is dominantly the caller's malformed args, not a tool defect (methodology §8,
 * "a tool must not be punished for its caller's plan"), and modern MCP servers
 * fold JSON-RPC -32602 "invalid params" into isError text — so counting it would
 * ding a tool's public Wilson score for the agent's mistake. Genuine OUTPUT
 * drift (`schema_drift_suspect`) stays attributable: that IS the tool's fault.
 */
export function isAttributable(cls: OutcomeClass): boolean {
  if (cls === "tool_fail:schema") return false;
  return (
    cls === "success" ||
    cls.startsWith("hard_fail:") ||
    cls.startsWith("tool_fail:") ||
    cls === "schema_drift_suspect"
  );
}
