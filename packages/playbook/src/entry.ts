import type { CapabilityEntry } from "@rosterhq/shared";
import { namespacedId } from "@rosterhq/shared";
import type { ParsedSkill } from "./skill.js";

export const SKILL_SOURCE = "skill";

/**
 * Skills join the same capability index as tools — full body included, which
 * is the load-bearing detail (SkillRouter: metadata alone is insufficient).
 */
export function skillToCapabilityEntry(skill: ParsedSkill): CapabilityEntry {
  return {
    id: namespacedId(SKILL_SOURCE, skill.slug),
    kind: "skill",
    source: SKILL_SOURCE,
    name: skill.name,
    description: skill.description || `Skill: ${skill.name}`,
    body: skill.body,
    path: skill.dir,
  };
}

export interface SkillInvocationResult {
  name: string;
  description: string;
  instructions: string;
  resources: string[];
  scriptsNote: string | null;
}

/**
 * The universal skill-as-tool bridge payload: invoking a skill returns its
 * instructions and resource manifest. Scripts are LISTED, never executed by
 * Roster — execution stays in the agent's hands and policies.
 */
export function skillInvocationResult(skill: ParsedSkill): SkillInvocationResult {
  return {
    name: skill.name,
    description: skill.description,
    instructions: skill.body,
    resources: skill.resources.map((rel) => `${skill.dir}/${rel}`),
    scriptsNote:
      skill.scripts.length > 0
        ? `This skill bundles ${skill.scripts.length} script(s); run them via your own execution tool if appropriate: ${skill.scripts.join(", ")}`
        : null,
  };
}
