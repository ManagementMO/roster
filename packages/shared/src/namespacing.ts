const INVALID = /[^a-zA-Z0-9_-]+/g;

/** Sanitize any identifier segment to MCP-safe [a-zA-Z0-9_-]. */
export function sanitizeSegment(raw: string): string {
  const cleaned = raw.replace(INVALID, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned : "x";
}

/**
 * Source segment must never contain the "__" separator, or parsing becomes ambiguous.
 * Tool segments may keep single underscores; only the source side is collapsed.
 */
export function sanitizeSource(raw: string): string {
  return sanitizeSegment(raw).replace(/_{2,}/g, "_");
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
