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
  /** The call exceeded its deadline. */
  timedOut?: boolean;
  /** MCP result carried isError: true. */
  isError?: boolean;
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
  if (e.isError) return `tool_fail:${classifyToolFailKind(e.errorText ?? "")}`;
  if (e.outputSchemaViolation) return "schema_drift_suspect";
  return "success";
}

/** Heuristic taxonomy aligned with MCP-Atlas categories; auth checked before schema on purpose ("invalid token" is auth, not schema). */
export function classifyToolFailKind(errorText: string): ToolFailKind {
  const t = errorText.toLowerCase();
  if (/unauthori[sz]ed|forbidden|permission denied|credential|api.?key|token|\b401\b|\b403\b|\bauth/.test(t)) {
    return "auth";
  }
  if (/quota|rate.?limit|too many requests|\b429\b/.test(t)) return "quota";
  if (/time.?out|timed out|deadline|etimedout/.test(t)) return "timeout";
  if (/schema|invalid (argument|param|input|request)|validation|required (field|property|parameter)|must be of type/.test(t)) {
    return "schema";
  }
  if (/internal (server )?error|\b500\b|panic|crashed|segfault/.test(t)) return "internal";
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
