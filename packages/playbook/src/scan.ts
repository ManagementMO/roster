import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readFileHead } from "./boundedRead.js";
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

/**
 * Cap on SKILL.md bytes read from disk. A SKILL.md is prose — the spec's own
 * examples are a few KB — so 1 MiB is far beyond anything legitimate while a
 * hostile multi-gigabyte file (or /dev/zero behind a symlink) can no longer
 * stall or OOM a listing boundary: `serve` boot, `init`, and `receipt` all scan
 * untrusted skill text.
 *
 * Reaching the cap NEVER truncates-and-trusts. The skill keeps a
 * `skill-md-truncated:` warning, which `trustScan` turns into a
 * `scan-incomplete` finding → `review` → withheld at the serving boundary
 * unless the operator sets ROSTER_ALLOW_REVIEW_SKILLS=1. Below the cap the body
 * is still indexed WHOLE.
 */
export const MAX_SKILL_MD_BYTES = 1024 * 1024;

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
    // SKILL.md symlink policy, stated rather than implied: a symlinked SKILL.md
    // is READ (dotfile managers legitimately link skill files, so refusing
    // outright would break real installs) but is NEVER silently trusted — the
    // security walk below already emits `symlink:SKILL.md` for it, which becomes
    // a review finding, so the skill is withheld at the serving boundary unless
    // the operator opts in. Locked by "flags a symlinked SKILL.md for review".
    let head: { text: string; truncated: boolean; symlinked: boolean };
    try {
      head = readFileHead(skillMd, MAX_SKILL_MD_BYTES, { allowSymlink: true });
    } catch {
      // Unreadable, or not a regular file (FIFO/device/directory): the skill is
      // not discovered at all, which is the fail-closed direction.
      continue;
    }
    const parsed = parseSkillMd(head.text, entry.name, dir);
    if (!parsed) continue;
    const resources = listResources(dir);
    const securityWalk = listScripts(dir);
    const scanWarnings = [
      ...new Set([
        ...securityWalk.warnings,
        ...(head.symlinked ? ["symlink:SKILL.md"] : []),
        ...(head.truncated ? [`skill-md-truncated:${MAX_SKILL_MD_BYTES}`] : []),
      ]),
    ].sort();
    skills.push({
      ...parsed,
      resources,
      // Scripts are a SECURITY input, not a display list, so they get their own
      // COMPLETE bounded walk — never `resources.filter(isScriptPath)`. Deriving
      // them from the 200-capped display list let a skill hide a malicious script
      // behind 200 benign files: it was neither listed nor scanned, so the skill
      // scanned "ok" and (with the R5-09 gate) was served (R5-15).
      scripts: securityWalk.scripts,
      scanWarnings,
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

/** Hard cap on scripts DISCOVERED (not displayed) — generous, but a runaway tree still terminates. */
const MAX_SCRIPTS_SCANNED = 5_000;

/**
 * A COMPLETE, independent walk for scripts — the trust scanner's actual input.
 * Unlike listResources (a capped DISPLAY list), this is not bounded by resource
 * position, so a malicious script cannot be pushed out of view behind a wall of
 * benign files (R5-15). Its own large cap prevents a pathological tree from
 * hanging the scan; reaching it would itself warrant review, but 5,000 scripts in
 * one skill is far beyond anything legitimate.
 */
function listScripts(dir: string): { scripts: string[]; warnings: string[] } {
  const out: string[] = [];
  const warnings = new Set<string>();
  const walk = (rel: string): void => {
    if (out.length >= MAX_SCRIPTS_SCANNED) {
      warnings.add(`script-scan-cap:${MAX_SCRIPTS_SCANNED}`);
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {
      warnings.add(`unreadable-directory:${rel || "."}`);
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_SCRIPTS_SCANNED) {
        warnings.add(`script-scan-cap:${MAX_SCRIPTS_SCANNED}`);
        return;
      }
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      const childAbs = path.join(dir, childRel);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(childAbs);
      } catch {
        warnings.add(`unreadable-entry:${childRel}`);
        continue;
      }
      if (stat.isSymbolicLink()) {
        warnings.add(`symlink:${childRel}`);
        continue;
      }
      if (stat.isDirectory()) {
        walk(childRel);
        continue;
      }
      if (!stat.isFile()) {
        warnings.add(`unsupported-entry:${childRel}`);
        continue;
      }
      if (childRel === "SKILL.md") continue;
      const executable = (stat.mode & 0o111) !== 0;
      if (!isScriptPath(childRel) && !executable) continue;
      out.push(childRel);
      try {
        fs.accessSync(childAbs, fs.constants.R_OK);
      } catch {
        warnings.add(`unreadable-file:${childRel}`);
      }
    }
  };
  walk("");
  if (out.length >= MAX_SCRIPTS_SCANNED) {
    warnings.add(`script-scan-cap:${MAX_SCRIPTS_SCANNED}`);
  }
  return { scripts: out.sort(), warnings: [...warnings].sort() };
}
