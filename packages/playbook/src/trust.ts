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

export function trustScan(skill: Pick<ParsedSkill, "body" | "scripts">): TrustReport {
  const findings: TrustFinding[] = [];
  for (const rule of BODY_RULES) {
    if (rule.pattern.test(skill.body)) {
      findings.push({ rule: rule.id, detail: rule.detail });
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
