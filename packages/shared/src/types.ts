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
  /** JSON Schema for tool inputs. Absent for skills. */
  inputSchema?: Record<string, unknown>;
  /** Declared output schema, when the backend provides one. */
  outputSchema?: Record<string, unknown>;
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

export interface OutcomeRecord {
  ts: number;
  session: string;
  source: string;
  capability: string;
  needHash: string | null;
  intentCategory: string | null;
  outcomeClass: OutcomeClass;
  latencyMs: number;
  softFail: boolean;
  substituted: boolean;
  explored: boolean;
  specVersion: string | null;
}

export interface RatingRow {
  capabilityId: string;
  category: string;
  n: number;
  successes: number;
  wilsonLb: number;
  p50Ms: number | null;
  p95Ms: number | null;
  updatedAt: number;
}
