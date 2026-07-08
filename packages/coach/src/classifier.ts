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
 * Heuristic taxonomy aligned with MCP-Atlas categories, tuned against a 46-text
 * real-wire corpus (docs/lab/notes-classifier-realworld.md — 11→0 misroutes, 0
 * regressions). Precedence, top to bottom: timeout → quota → internal → schema →
 * auth → other. The order encodes ATTRIBUTABILITY, not just accuracy:
 *   • Quoted literals ('…'/"…") are stripped FIRST — an echoed file path or JSON
 *     fragment must never classify. An ENOENT on 'auth-tokens.txt' is a missing
 *     file, not an auth failure; "Unexpected token < in JSON" is not auth.
 *   • quota BEFORE auth — "Authenticated requests get a higher rate limit" is a
 *     429; the bare word "auth"/"token" would otherwise steal it (audit M4).
 *   • internal BEFORE schema — an EXPLICIT server-fault signal (500/502/503,
 *     "internal server error", panic/crash) wins even when the same text also
 *     carries a schema-ish word, so a crashing tool ("500 … validation panic")
 *     isn't excused as a caller error. A BARE "internal validation error" with
 *     no such signal is ambiguous and stays schema (non-attributable) by §8.
 *   • schema (caller-side, non-attributable) BEFORE auth — "invalid token format
 *     in <arg>" is a caller arg fault (methodology §8), not the tool's attributable
 *     auth failure. The precise fix is P7(c): validate args against inputSchema.
 * The token rule is CONTEXTUAL (invalid/expired/… adjacent to "token"), never a
 * bare `token`; auth is underscore-tolerant (invalid_auth, not_authed) and
 * covers access-denied — the four under-matches the corpus exposed.
 */
export function classifyToolFailKind(errorText: string): ToolFailKind {
  // Strip quoted literals so echoed paths/args/JSON can never trigger a kind.
  const t = errorText.toLowerCase().replace(/'[^']*'|"[^"]*"/g, " ");
  if (/time.?out|timed out|deadline|etimedout/.test(t)) return "timeout";
  // quota BEFORE auth: "30000 tokens per min" / "Authenticated requests get a
  // higher rate limit" are quota messages that a bare `token`/`auth` word would
  // otherwise misroute to auth (audit M4). Order encodes precedence.
  if (/quota|rate.?limit|too many requests|\b429\b|tokens?\s+per\b|per\s+(minute|min|second|sec|hour|day)\b/.test(t)) {
    return "quota";
  }
  // internal BEFORE schema, and 502/503 alongside 500 — a server 5xx/panic is
  // the tool's fault even when its text happens to contain "validation".
  if (/internal (server )?error|\b50[023]\b|panic|crashed|segfault/.test(t)) return "internal";
  // schema (caller-side, non-attributable) BEFORE auth so "invalid token format
  // in <arg>" lands here, not on the `token` in auth. Best-effort by
  // construction; the precise fix is P7(c) — validate args against inputSchema.
  if (
    /schema|invalid (argument|param|input|request)|validation|required (field|property|parameter)|must be of type|invalid\b[\w\s'"()-]{0,40}\b(format|argument|parameter|value|type|field|property)\b/.test(
      t,
    )
  ) {
    return "schema";
  }
  // auth: underscore-tolerant idioms (invalid_auth, not_authed), access-denied,
  // and CONTEXTUAL token-credential patterns — never a bare `token`, which
  // misrouted "Unexpected token"/"…128000 tokens"/quoted 'auth-tokens.txt'.
  if (
    /unauthori[sz]ed|forbidden|permission denied|access denied|credential|api.?key|signature|(?:^|[^a-z])auth|\b40[13]\b|(?:invalid|expired|revoked|missing|bad)[^.;]{0,40}\btoken\b|\btoken\b[^.;]{0,40}(?:invalid|expired|revoked)/.test(
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
