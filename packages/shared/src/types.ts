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
  /** Human-facing title, when the backend supplies one (MCP `tool.title`). */
  title?: string;
  /** Tool behavior hints (readOnlyHint/destructiveHint/…) — safety-relevant; passed through verbatim. */
  annotations?: Record<string, unknown>;
  /** JSON Schema for tool inputs. Absent for skills. */
  inputSchema?: Record<string, unknown>;
  /** Declared output schema, when the backend provides one. */
  outputSchema?: Record<string, unknown>;
  /** MCP `tool.execution` capability hints — passed through verbatim in transparent mode. */
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

