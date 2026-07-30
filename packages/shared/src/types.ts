/** A capability is anything the router can serve to an agent: a tool (a player) or a skill (a play). */
export type CapabilityKind = "tool" | "skill";

export interface CapabilityEntry {
  /** Namespaced id, e.g. "github__create_issue" or "skill__pdf-form-filler". */
  id: string;
  kind: CapabilityKind;
  /** Source id: backend server name for tools, "skill" source label for skills. */
  source: string;
  name: string;
  description: string;
  /** Human-facing title (MCP `tool.title`). Definition text the agent is shown;
   *  participates in the Coach drift fingerprint (a change quarantines). */
  title?: string;
  /** Tool behavior hints (readOnlyHint/destructiveHint/idempotentHint/openWorldHint).
   *  Safety-relevant: clients gate confirmations on these, so they are passed
   *  through verbatim AND participate in the Coach drift fingerprint — a backend
   *  flipping destructiveHint true→false is drift (quarantine + event). */
  annotations?: Record<string, unknown>;
  /** JSON Schema for tool inputs. Absent for skills. Part of the drift fingerprint. */
  inputSchema?: Record<string, unknown>;
  /** Declared output schema, when the backend provides one. Part of the drift fingerprint. */
  outputSchema?: Record<string, unknown>;
  /** MCP `tool.execution` capability hints (task-support). Passed through verbatim
   *  in transparent mode AND part of the drift fingerprint (contract change). */
  execution?: Record<string, unknown>;
  /** Full SKILL.md body (frontmatter stripped). Present for skills only — indexed whole, per SkillRouter. */
  body?: string;
  /** Absolute path to the skill directory. Skills only. */
  path?: string;
}

export type ToolFailKind = "auth" | "quota" | "schema" | "timeout" | "internal" | "other";

export type OutcomeClass =
  | "success"
  | "hard_fail:transport"
  | "hard_fail:protocol"
  | `tool_fail:${ToolFailKind}`
  | "schema_drift_suspect";

export type LatencyBucket = "<250" | "250-1000" | "1000-4000" | ">4000";

