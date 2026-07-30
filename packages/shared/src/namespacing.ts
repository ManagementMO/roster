import { createHash } from "node:crypto";

const INVALID = /[^a-zA-Z0-9_-]+/g;
const GENERATED_SUFFIX = /-[a-f0-9]{10}$/;

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

function sha256PublicName(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Make a public capability segment safe without conflating distinct raw names.
 * Already-safe names retain their compact historical public identity.
 */
export function stableSegment(raw: string): string {
  const safe = sanitizeSegment(raw);
  return raw === safe && !GENERATED_SUFFIX.test(raw)
    ? safe
    : `${safe}-${sha256PublicName(raw).slice(0, 10)}`;
}

/**
 * The deterministic, boundary-safe part of a backend source key. The source is
 * encoded again in stableNamespacedId, so names sanitizeSource would change get
 * their own raw-name hash before that second boundary can collapse them.
 */
export function stableBackendName(raw: string): string {
  const segment = stableSegment(raw);
  const source = sanitizeSource(segment);
  const name = segment === source && source !== "skill-server"
    ? segment
    : `${source}-${sha256PublicName(raw).slice(0, 10)}`;
  return name === "skill" ? "skill-server" : name;
}

/** @deprecated Use stableBackendName for all public backend identities. */
export function normalizeBackendName(raw: string): string {
  return stableBackendName(raw);
}

export const NAMESPACE_SEP = "__";

export function namespacedId(source: string, name: string): string {
  return `${sanitizeSource(source)}${NAMESPACE_SEP}${sanitizeSegment(name)}`;
}

/** Public capability id that remains unique across sanitizer collisions. */
export function stableNamespacedId(source: string, rawName: string): string {
  return `${sanitizeSource(source)}${NAMESPACE_SEP}${stableSegment(rawName)}`;
}

export function parseNamespacedId(id: string): { source: string; name: string } | null {
  const idx = id.indexOf(NAMESPACE_SEP);
  if (idx <= 0 || idx >= id.length - NAMESPACE_SEP.length) return null;
  return { source: id.slice(0, idx), name: id.slice(idx + NAMESPACE_SEP.length) };
}
