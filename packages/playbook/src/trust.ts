import path from "node:path";
import { readFileHead } from "./boundedRead.js";
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

export interface Rule {
  id: string;
  pattern: RegExp;
  detail: string;
}

/**
 * Exported so the suite can hold EVERY rule — present and future — to the
 * linear-time bar on hostile input, instead of only the one that was known to
 * backtrack. Adding a rule with overlapping unbounded quantifiers fails that
 * test rather than shipping a boot-time DoS.
 */
export const TRUST_RULES: readonly Rule[] = [
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
    // Linear by CONSTRUCTION, and with NO semantic length cap (a real `rm`
    // accepts arbitrarily long repeated-flag clusters, so a cap would be a
    // trivial bypass — `rm -rr…rf /`).
    //
    // The pre-fix form `-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r` wrapped each required
    // letter in UNBOUNDED runs, so a failing match enumerated the O(n²) ways to
    // split the cluster (a 4 KB body of `rm -` + "rf"×2048 took 9.7 s, and every
    // listing boundary scans untrusted SKILL.md text).
    //
    // Here the two required letters are checked by ZERO-WIDTH lookaheads that run
    // exactly once at the fixed position after `-` (each an O(k) forward scan for
    // `r` / `f`), then a single greedy `[a-z]+` consumes the cluster once. When
    // `\s+[~/]` fails, only `[a-z]+` backtracks — one char at a time, O(k) — and
    // the already-matched zero-width lookaheads are NOT re-evaluated, so there is
    // no multiplicative backtracking. Measured ~linear: 1 MiB in ~5.7 ms.
    //
    // Semantics: requires a flag cluster containing BOTH r and f (any order, any
    // length, other flags allowed) followed by whitespace and a ~ or / target.
    // `rm -r`/`rm -f` alone, a missing target, and non-home/root targets do not
    // match.
    pattern: /\brm\s+-(?=[a-z]*r)(?=[a-z]*f)[a-z]+\s+[~/]/i,
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
    Partial<Pick<ParsedSkill, "name" | "description" | "dir" | "scanWarnings">>,
): TrustReport {
  const findings: TrustFinding[] = [];
  const seen = new Set<string>();
  const scan = (text: string, where: string, rules: readonly Rule[]): void => {
    for (const rule of rules) {
      if (!rule.pattern.test(text)) continue;
      const key = `${rule.id}:${where}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ rule: rule.id, detail: `${rule.detail} (${where})` });
    }
  };

  scan(`${skill.name ?? ""}\n${skill.description ?? ""}`, "metadata", TRUST_RULES);
  scan(skill.body, "body", TRUST_RULES);

  // Real code is full of base64-looking and env-reading fragments, so scripts
  // are scanned for the actionable threats only — not the generic base64 rule,
  // which would flag every minified bundle. `dir` present ⇒ read from disk.
  const scriptRules = TRUST_RULES.filter((r) => r.id !== "base64-blob");
  if (skill.dir) {
    for (const rel of skill.scripts) {
      try {
        scan(
          readFileHead(path.join(skill.dir, rel), MAX_SCRIPT_BYTES).text,
          `script:${rel}`,
          scriptRules,
        );
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
  for (const warning of skill.scanWarnings ?? []) {
    const rule = warning.startsWith("symlink:") ? "symlink" : "scan-incomplete";
    const key = `${rule}:${warning}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      rule,
      detail: `${warning} (filesystem discovery did not establish a fully trusted skill tree)`,
    });
  }
  return { status: findings.length > 0 ? "review" : "ok", findings };
}
