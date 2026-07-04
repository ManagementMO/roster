import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { isScriptPath, parseSkillMd, type ParsedSkill } from "./skill.js";

/**
 * Default skill library locations across the ecosystem. Every path is
 * existence-checked; nothing is created. Verified sources: Claude Code
 * (~/.claude/skills, project .claude/skills), the cross-tool ~/.agents/skills
 * convention, OpenClaw's library.
 */
export function defaultSkillSources(opts: { home?: string; cwd?: string } = {}): string[] {
  // ROSTER_TEST_HOME keeps discovery hermetic under test — without it, init in
  // a fixture home read the developer's real ~/.claude/skills.
  const home = opts.home ?? process.env.ROSTER_TEST_HOME ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return [
    path.join(home, ".claude", "skills"),
    path.join(home, ".agents", "skills"),
    path.join(home, ".openclaw", "skills"),
    path.join(cwd, ".claude", "skills"),
  ];
}

const MAX_RESOURCES_LISTED = 200;

/** Scan one library directory: every child dir containing SKILL.md is a skill. */
export function scanSkillLibrary(libraryDir: string): ParsedSkill[] {
  if (!fs.existsSync(libraryDir)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(libraryDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills: ParsedSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(libraryDir, entry.name);
    const skillMd = path.join(dir, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;
    let content: string;
    try {
      content = fs.readFileSync(skillMd, "utf8");
    } catch {
      continue;
    }
    const parsed = parseSkillMd(content, entry.name, dir);
    if (!parsed) continue;
    const resources = listResources(dir);
    skills.push({
      ...parsed,
      resources,
      scripts: resources.filter(isScriptPath),
    });
  }
  return skills;
}

export function scanSkillSources(sources: readonly string[]): ParsedSkill[] {
  const seen = new Map<string, ParsedSkill>();
  for (const source of sources) {
    for (const skill of scanSkillLibrary(source)) {
      // First source wins on slug collisions (user dirs are listed before shared ones).
      if (!seen.has(skill.slug)) seen.set(skill.slug, skill);
    }
  }
  return [...seen.values()];
}

function listResources(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    if (out.length >= MAX_RESOURCES_LISTED) return;
    const abs = path.join(dir, rel);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_RESOURCES_LISTED) return;
      if (entry.name.startsWith(".")) continue;
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(childRel);
      else if (childRel !== "SKILL.md") out.push(childRel);
    }
  };
  walk("");
  return out.sort();
}
