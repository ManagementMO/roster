import type { CapabilityEntry } from "@rosterhq/shared";

/** What draft returns per capability: enough to pick and call, nothing more. */
export interface CapabilityCard {
  id: string;
  kind: "tool" | "skill";
  description: string;
  /** Trimmed input schema: property names + types + required. Tools only. */
  input?: Record<string, unknown>;
  note?: string;
}

const DESCRIPTION_LIMIT = 240;
// Draft cards are a token budget, not a spec dump. One pathological tool (a
// 1000-value enum, a 200-property object) otherwise renders a card heavier than
// the entire rest of the roster — width is the token sink depth trimming misses.
const MAX_ENUM_VALUES = 16;
const MAX_PROPS = 50;

export function toCard(entry: CapabilityEntry): CapabilityCard {
  const card: CapabilityCard = {
    id: entry.id,
    kind: entry.kind,
    description: truncate(entry.description, DESCRIPTION_LIMIT),
  };
  if (entry.kind === "tool" && entry.inputSchema) {
    card.input = trimSchema(entry.inputSchema);
  }
  if (entry.kind === "skill") {
    card.note = "skill — call it to receive its full instructions and resources";
  }
  return card;
}

/** Depth-1 schema trim: keeps shape, drops nested prose AND caps width (the two token sinks). */
export function trimSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type ?? "object" };
  const props = schema.properties;
  if (props && typeof props === "object") {
    const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
    const entries = Object.entries(props as Record<string, unknown>);
    // Keep required properties first, then fill to the cap — the agent always
    // sees what it MUST pass; a note flags any elision so it isn't silent.
    const ordered = [
      ...entries.filter(([k]) => required.includes(k)),
      ...entries.filter(([k]) => !required.includes(k)),
    ];
    const trimmed: Record<string, unknown> = {};
    for (const [key, value] of ordered.slice(0, MAX_PROPS)) {
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        trimmed[key] = { type: v.type ?? "any", ...trimEnum(v.enum) };
      } else {
        trimmed[key] = { type: "any" };
      }
    }
    out.properties = trimmed;
    if (ordered.length > MAX_PROPS) out["x-trimmed-properties"] = ordered.length - MAX_PROPS;
  }
  if (Array.isArray(schema.required) && schema.required.length > 0) {
    out.required = schema.required;
  }
  return out;
}

/** Cap enum width; a long enum is a token sink and the agent only needs a sample of the shape. */
function trimEnum(enumValue: unknown): Record<string, unknown> {
  if (!Array.isArray(enumValue)) return {};
  if (enumValue.length <= MAX_ENUM_VALUES) return { enum: enumValue };
  return { enum: enumValue.slice(0, MAX_ENUM_VALUES), "x-enum-truncated": enumValue.length - MAX_ENUM_VALUES };
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
