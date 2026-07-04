import type { ParsedSkill } from "./skill.js";

/**
 * OpenClaw injects every installed skill's metadata into every system prompt.
 * The cost is deterministic (their <available_skills> block):
 *   total ≈ 195 + Σ (97 + len(name) + len(description) + len(filepath))
 * This makes the skills receipt line EXACT for OpenClaw — no estimation caveat
 * needed on the character count (tokens remain an estimate).
 */
const BASE_OVERHEAD_CHARS = 195;
const PER_SKILL_OVERHEAD_CHARS = 97;

export function openclawInjectionChars(
  skills: ReadonlyArray<Pick<ParsedSkill, "name" | "description" | "dir">>,
): number {
  if (skills.length === 0) return 0;
  let total = BASE_OVERHEAD_CHARS;
  for (const skill of skills) {
    const filepath = `${skill.dir}/SKILL.md`;
    total += PER_SKILL_OVERHEAD_CHARS + skill.name.length + skill.description.length + filepath.length;
  }
  return total;
}
