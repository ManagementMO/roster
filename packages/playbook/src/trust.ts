import fs from "node:fs";
import path from "node:path";
import type { ParsedSkill } from "./skill.js";

/**
 * Trust scan v0 — deliberately conservative heuristics, entirely local.
 * Findings gate a skill into "review" status; they are advisory flags for a
 * human, never an automated verdict published anywhere (handoff §6.7 Trust).
 */
export interface TrustFinding {
  rule: string;
  detail: string;
}

export interface TrustReport {
  status: "ok" | "review";
  findings: TrustFinding[];
}

interface Rule {
  id: string;
  pattern: RegExp;
  detail: string;
}

const BODY_RULES: Rule[] = [
  {
    id: "injection-override",
    pattern: /ignore (all |any )?(previous|prior|above) (instructions|rules|guidance)/i,
    detail: "instruction-override phrasing in skill body",
  },
  {
    id: "concealment",
    pattern: /do(n't| not) (tell|inform|mention|reveal|show)( this)? (to )?(the )?user/i,
    detail: "asks the agent to hide behavior from the user",
  },
  {
    id: "exfil-language",
    pattern: /\b(exfiltrate|send (all |the )?(credentials|secrets|tokens|keys))\b/i,
    detail: "credential-exfiltration language",
  },
  {
    id: "curl-pipe-shell",
    pattern: /\b(curl|wget)\b[^\n]{0,200}\|\s*(ba)?sh\b/i,
    detail: "pipe-to-shell install pattern",
  },
  {
    id: "destructive-command",
    pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)[a-z]*\s+[~/]/i,
    detail: "recursive force-delete against home or root paths",
  },
  {
    id: "base64-blob",
    pattern: /[A-Za-z0-9+/]{400,}={0,2}/,
    detail: "large base64 blob embedded in instructions",
  },
  {
    id: "env-harvest",
    pattern: /\b(printenv|process\.env|os\.environ)\b[^\n]{0,120}\b(curl|wget|fetch|post|http)/i,
    detail: "environment variables flowing toward network calls",
  },
];

/** Bytes of any one bundled script we read before scanning (safety cap). */
const MAX_SCRIPT_BYTES = 256 * 1024;

/**
 * Read at most `maxBytes` from the head of a file WITHOUT loading the whole
 * thing. readFileSync(...).slice() reads the entire file first, so a huge
 * bundled script would OOM/throw — and that throw, swallowed by the caller,
 * silently left the script UNSCANNED (re-opening the curl|bash-in-a-script
 * false-negative this scan exists to close).
 */
function readHead(file: string, maxBytes: number): string {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.allocUnsafe(maxBytes);
    const n = fs.readSync(fd, buf, 0, maxBytes, 0);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Scans body AND the two blind spots the lab surfaced: the `description` (the
 * exact text OpenClaw injects into every prompt and retrieval indexes — the
 * highest-value injection surface) and the CONTENTS of bundled scripts (a path
 * list alone hid curl|bash and base64-exec). Findings are advisory ("review"),
 * never an automated verdict — so a false positive just asks a human to look.
 * `name`/`description`/`dir` are optional so existing pure-data callers still
 * type-check; when `dir` is present, scripts are read from disk and scanned.
 */
export function trustScan(
  skill: Pick<ParsedSkill, "body" | "scripts"> &
    Partial<Pick<ParsedSkill, "name" | "description" | "dir">>,
): TrustReport {
  const findings: TrustFinding[] = [];
  const seen = new Set<string>();
  const scan = (text: string, where: string, rules: Rule[]): void => {
    for (const rule of rules) {
      if (!rule.pattern.test(text)) continue;
      const key = `${rule.id}:${where}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ rule: rule.id, detail: `${rule.detail} (${where})` });
    }
  };

  scan(`${skill.name ?? ""}\n${skill.description ?? ""}`, "metadata", BODY_RULES);
  scan(skill.body, "body", BODY_RULES);

  // Real code is full of base64-looking and env-reading fragments, so scripts
  // are scanned for the actionable threats only — not the generic base64 rule,
  // which would flag every minified bundle. `dir` present ⇒ read from disk.
  const scriptRules = BODY_RULES.filter((r) => r.id !== "base64-blob");
  if (skill.dir) {
    for (const rel of skill.scripts) {
      try {
        scan(readHead(path.join(skill.dir, rel), MAX_SCRIPT_BYTES), `script:${rel}`, scriptRules);
      } catch {
        // Unreadable script: the bundled-scripts advisory below still fires.
      }
    }
  }

  if (skill.scripts.length > 0) {
    findings.push({
      rule: "bundled-scripts",
      detail: `bundles ${skill.scripts.length} executable script(s) — review before allowing execution`,
    });
  }
  return { status: findings.length > 0 ? "review" : "ok", findings };
}
