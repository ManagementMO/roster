import { parse as parseYaml } from "yaml";

/** A parsed SKILL.md per the Agent Skills spec (agentskills.io). */
export interface ParsedSkill {
  /** Directory name — the skill's stable identifier within a library. */
  slug: string;
  name: string;
  description: string;
  /** Markdown body with frontmatter stripped — indexed WHOLE (SkillRouter finding). */
  body: string;
  /** Absolute path to the skill directory. */
  dir: string;
  /** Relative paths of bundled resources (scripts/, references/, assets/, …). */
  resources: string[];
  /** Subset of resources that are executable scripts. */
  scripts: string[];
  /** Raw frontmatter for forward-compat fields (license, allowed-tools, …). */
  frontmatter: Record<string, unknown>;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const SCRIPT_EXT = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|pl)$/i;

export function isScriptPath(rel: string): boolean {
  return SCRIPT_EXT.test(rel);
}

/**
 * Parse SKILL.md content. Frontmatter `name` and `description` are required by
 * the spec; we fall back to the directory slug for name so a sloppy-but-real
 * skill still indexes (flagged via empty description).
 */
export function parseSkillMd(
  content: string,
  slug: string,
  dir: string,
): Omit<ParsedSkill, "resources" | "scripts"> | null {
  // A leading UTF-8 BOM sits before the "---", so ^--- never matches and the
  // ENTIRE frontmatter is silently voided (name→slug, description→""). Strip it
  // before parsing; String.trim() later hides the BOM, so this is invisible otherwise.
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const match = FRONTMATTER.exec(content);
  let frontmatter: Record<string, unknown> = {};
  let body = content;
  if (match) {
    body = content.slice(match[0].length);
    try {
      const parsed = parseYaml(match[1] ?? "");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        frontmatter = parsed as Record<string, unknown>;
      }
    } catch {
      return null; // broken frontmatter → not a valid skill
    }
  }
  const name = typeof frontmatter.name === "string" && frontmatter.name.trim() !== ""
    ? frontmatter.name.trim()
    : slug;
  const description =
    typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
  return { slug, name, description, body: body.trim(), dir, frontmatter };
}
