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

/*
 * Fragments of the `destructive-command` heuristic. The equivalent single regex
 * literal is 433 characters; this is the one rule a hostile skill will probe, so
 * it is assembled from named parts a reviewer can check one at a time. Each part
 * is regex SOURCE, so composition is plain concatenation.
 */

/**
 * Whitespace WITHIN one command: spaces/tabs, plus shell line continuations.
 * Deliberately NOT `\s` — `\s` spans a bare newline, so the predecessor joined
 * `rm -rf` at the end of one line to `/usr/local/bin/tool` at the start of the
 * next and called it one command (483 of its 1,796 measured fuzz false positives).
 */
const RM_SEP = String.raw`[ \t]+(?:\\\r?\n[ \t]+)*`;

/**
 * One option token. It must contain an alphanumeric, so a BARE `--` is NOT an
 * option — that is what lets the rule honour end-of-options: after `--`, `-r`
 * and `-f` are operands, so `rm -- -r -f /` forces NOTHING, while `rm -r -f -- /`
 * (a real destructive command) still matches through the optional trailing `--`.
 */
const RM_FLAG = "--?[A-Za-z0-9][-A-Za-z0-9=]*";
const RM_OPT = `(?:${RM_SEP}${RM_FLAG})`;

/**
 * A token that SUPPLIES recursive / force: either a short cluster containing the
 * letter (`-r`, `-fr`, `-xrfy`), or the long option — spelled as every
 * abbreviation GNU getopt_long accepts, and nothing longer. `--recursive` and
 * `--force` are rm's ONLY long options starting with r / f, so `rm --r --f /`
 * really does recursively force-delete `/` (verified against GNU coreutils 9.4);
 * accepting only the full spellings left a one-token evasion. The `(?![-\w])`
 * guard keeps `--reflink=always` / `--fsync` — options of OTHER tools, which rm
 * rejects outright — from counting as evidence.
 */
const RM_RECURSIVE = String.raw`-(?:[a-z]*r|-(?:recursive|recursiv|recursi|recurs|recur|recu|rec|re|r)(?![-\w]))`;
const RM_FORCE = String.raw`-(?:[a-z]*f|-(?:force|forc|for|fo|f)(?![-\w]))`;

/**
 * Linear by CONSTRUCTION, and with NO semantic cap on cluster length or on the
 * number of intervening flags (a cap is a trivial bypass — `rm -rr…rf /`).
 *
 * The two required letters are carried by zero-width lookaheads at the fixed
 * position after `rm`. JS lookaheads are ATOMIC: once satisfied they are never
 * re-entered, so they cannot multiply with what follows. Inside each one,
 * `(?:SEP FLAG)*SEP -evidence` backtracks by whole TOKENS and tests exactly one
 * token per level; token extents are disjoint, so that is O(flag run). The run is
 * then consumed ONCE by the atomic-capture idiom `(?=(REGION+))\1` — `\1` is a
 * fixed string, so there is no split enumeration against the target check. That
 * is lossless here: a flag token starts with `-` and the target with `~`/`/`, so
 * no shorter prefix of the greedy run could let `SEP [~/]` succeed.
 *
 * `(?<![-\w=])` instead of `\b` is LOAD-BEARING FOR THIS CONSTRUCTION. `\b` also
 * matches the `rm` INSIDE a flag token (`-rm`, `--a=rm`), which is never an
 * invocation — and because such a start sits inside another command's flag run,
 * every start re-walks that run: measured 7,448 ms on 64 KiB of `rm -rm -rm …`
 * for the `\b` form (quadratic) versus 0.96 ms here (linear). (The PREDECESSOR
 * pattern was linear on that same input — its lookaheads never left the first
 * cluster — so this anchor is required by the token-scanning form, not a fix to
 * a shipped defect.) Excluding `-`, `=` and word chars is exactly what makes
 * distinct start positions' flag runs disjoint.
 *
 * Measured: log-log slope 0.956–1.063 across 19 adversarial shapes from 4 KiB to
 * 1 MiB; 30.6 ms worst case at the 1 MiB MAX_SKILL_MD_BYTES cap.
 *
 * Semantics: an `rm` in command position, whose flag run supplies BOTH recursive
 * and force (any order, any number of unrelated flags between, short clusters or
 * long options or a mix), followed by a `~` or `/` target on the SAME command.
 * `rm -r`/`rm -f` alone, a missing target, a relative/quoted/variable target, and
 * `rm` inside a flag or an assignment do not match.
 */
const DESTRUCTIVE_RM = new RegExp(
  String.raw`(?<![-\w=])rm` +
    `(?=${RM_OPT}*${RM_SEP}${RM_RECURSIVE})` +
    `(?=${RM_OPT}*${RM_SEP}${RM_FORCE})` +
    `(?=(${RM_OPT}+))` +
    String.raw`\1` +
    `(?:${RM_SEP}--)?` +
    `${RM_SEP}[~/]`,
  "i",
);

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
    // Built above from named fragments: the flat literal is 433 chars. The
    // predecessor `/\brm\s+-(?=[a-z]*r)(?=[a-z]*f)[a-z]+\s+[~/]/i` was linear but
    // required ONE cluster to carry both letters, so it missed every split and
    // long form — `rm -r -f /`, `rm --recursive --force /`, `rm --r --f /` — i.e.
    // 0/25 of the split-form corpus and recall 0.0967 on a 500,000-case fuzz
    // against a getopt oracle (this form: recall 1.0000, precision 0.966).
    pattern: DESTRUCTIVE_RM,
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
