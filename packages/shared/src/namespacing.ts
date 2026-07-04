const INVALID = /[^a-zA-Z0-9_-]+/g;

/** Sanitize any identifier segment to MCP-safe [a-zA-Z0-9_-]. */
export function sanitizeSegment(raw: string): string {
  const cleaned = raw.replace(INVALID, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned : "x";
}

/**
 * Source segment must be boundary-safe against the "__" separator. Two hazards,
 * both closed here:
 *  - a "__" INSIDE the source makes parseNamespacedId (first-"__" wins) split in
 *    the wrong place, so runs are collapsed to a single "_";
 *  - a source ENDING in "_" fuses with the separator ("a_" + "__" → "a___"),
 *    which both mis-splits AND collides: namespacedId("a_","b") and
 *    namespacedId("a","_b") would otherwise mint the same id "a___b" and route a
 *    call to the wrong backend. Trailing/leading "_" are stripped so the first
 *    "__" in any id is always exactly the separator.
 */
export function sanitizeSource(raw: string): string {
  const s = sanitizeSegment(raw).replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  return s.length > 0 ? s : "x";
}

/**
 * The deterministic part of a backend's source key: sanitize + the Playbook's
 * reserved-namespace rename. BackendManager may append a "-N" collision suffix
 * at connect time; callers needing the historical key of an UNAVAILABLE backend
 * (prune protection) use this base and tolerate the suffix separately.
 */
export function normalizeBackendName(raw: string): string {
  const name = sanitizeSource(raw);
  return name === "skill" ? "skill-server" : name;
}

export const NAMESPACE_SEP = "__";

export function namespacedId(source: string, name: string): string {
  return `${sanitizeSource(source)}${NAMESPACE_SEP}${sanitizeSegment(name)}`;
}

export function parseNamespacedId(id: string): { source: string; name: string } | null {
  const idx = id.indexOf(NAMESPACE_SEP);
  if (idx <= 0 || idx >= id.length - NAMESPACE_SEP.length) return null;
  return { source: id.slice(0, idx), name: id.slice(idx + NAMESPACE_SEP.length) };
}
