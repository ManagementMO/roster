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

/** Depth-1 schema trim: keeps shape, drops nested prose (the token sink). */
export function trimSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type ?? "object" };
  const props = schema.properties;
  if (props && typeof props === "object") {
    const trimmed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        trimmed[key] = { type: v.type ?? "any", ...(v.enum ? { enum: v.enum } : {}) };
      } else {
        trimmed[key] = { type: "any" };
      }
    }
    out.properties = trimmed;
  }
  if (Array.isArray(schema.required) && schema.required.length > 0) {
    out.required = schema.required;
  }
  return out;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
