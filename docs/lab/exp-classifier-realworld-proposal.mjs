#!/usr/bin/env node
/**
 * exp-classifier-realworld part (c2): PROPOSAL EVALUATION ONLY — repo code
 * untouched. Scores the current built classifyToolFailKind vs a proposed
 * variant on the same 39 realistic texts from part (c) plus the 4 error texts
 * captured from the real filesystem server in part (a).
 *
 * Proposed changes measured here:
 *   P1 quota checked BEFORE auth (rate-limit texts often mention auth words)
 *   P2 quoted literals stripped before matching (never classify from a path)
 *   P3 bare /token/ replaced with contextual token-credential patterns
 *   P4 underscore-tolerant auth idioms (invalid_auth, not_authed)
 *   P5 add "access denied" + "signature expired" to auth
 *   P6 internal covers 502/503 alongside 500
 *
 * Output: docs/lab/tmp-classifier-realworld/out-proposal.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { classifyToolFailKind } = await import(req.resolve("@rosterhq/coach"));

const TMP = path.join(repo, "docs/lab/tmp-classifier-realworld");
const errtexts = JSON.parse(fs.readFileSync(path.join(TMP, "out-errtexts.json"), "utf8"));
const scenarios = JSON.parse(fs.readFileSync(path.join(TMP, "out-scenarios.json"), "utf8"));

/** PROPOSED variant (lives only in this experiment). */
function proposedKind(errorText) {
  // P2: never classify from quoted literals (file paths echoed into messages)
  const t = errorText.toLowerCase().replace(/'[^']*'|"[^"]*"/g, " ");
  // P1: quota first
  if (/quota|rate.?limit|too many requests|\b429\b/.test(t)) return "quota";
  if (
    /unauthori[sz]ed|forbidden|permission denied|access denied|credential|api.?key|(?:^|[^a-z])auth|\b40[13]\b|signature expired|(?:invalid|expired|revoked|missing|bad)[^.;]{0,40}\btoken\b|\btoken\b[^.;]{0,40}(?:invalid|expired|revoked)/.test(
      t,
    )
  ) {
    return "auth";
  }
  if (/time.?out|timed out|deadline|etimedout/.test(t)) return "timeout";
  if (
    /schema|invalid (argument|param|input|request)|validation|required (field|property|parameter)|must be of type/.test(
      t,
    )
  ) {
    return "schema";
  }
  if (/internal (server )?error|\b50[023]\b|panic|crashed|segfault/.test(t)) return "internal";
  return "other";
}

// corpus = part (c) rows + real evidence texts captured from live servers in part (a)
const fromScenarios = scenarios.rows
  .filter((r) => r.evidence?.isError && r.evidence.errorText)
  .map((r) => ({
    source: `live-wire:${r.id}`,
    text: r.evidence.errorText,
    expectedKinds:
      r.id === "S2-fs-write-outside-sandbox"
        ? ["auth"]
        : r.id === "S3-fs-chmod000-read"
          ? ["auth"]
          : r.id.startsWith("S4")
            ? ["schema"]
            : ["other"],
  }));
const corpus = [
  ...errtexts.rows.map((r) => ({ source: r.source, text: r.text, expectedKinds: r.expectedKinds })),
  ...fromScenarios,
];

const rows = corpus.map((c) => {
  const current = classifyToolFailKind(c.text);
  const proposed = proposedKind(c.text);
  return {
    ...c,
    current,
    proposed,
    currentOk: c.expectedKinds.includes(current),
    proposedOk: c.expectedKinds.includes(proposed),
  };
});

const n = rows.length;
const curMis = rows.filter((r) => !r.currentOk);
const propMis = rows.filter((r) => !r.proposedOk);
const regressions = rows.filter((r) => r.currentOk && !r.proposedOk);
const fixes = rows.filter((r) => !r.currentOk && r.proposedOk);

const summary = {
  n,
  currentMisclassified: curMis.length,
  currentMisPct: +((100 * curMis.length) / n).toFixed(1),
  proposedMisclassified: propMis.length,
  proposedMisPct: +((100 * propMis.length) / n).toFixed(1),
  fixedByProposal: fixes.map((r) => `${r.source}: ${r.current} → ${r.proposed}`),
  regressionsFromProposal: regressions.map((r) => `${r.source}: ${r.current} → ${r.proposed}`),
  stillWrongUnderProposal: propMis.map((r) => `${r.source}: → ${r.proposed} (expected ${r.expectedKinds.join("|")})`),
};

console.log(`corpus n=${n}`);
console.log(`current : ${curMis.length} misclassified (${summary.currentMisPct}%)`);
console.log(`proposed: ${propMis.length} misclassified (${summary.proposedMisPct}%)`);
console.log(`fixes: ${JSON.stringify(summary.fixedByProposal, null, 2)}`);
console.log(`regressions: ${JSON.stringify(summary.regressionsFromProposal, null, 2)}`);
console.log(`still wrong: ${JSON.stringify(summary.stillWrongUnderProposal, null, 2)}`);

fs.writeFileSync(
  path.join(TMP, "out-proposal.json"),
  JSON.stringify(
    {
      experiment: "classifier-realworld part (c2) — proposal evaluation (repo untouched)",
      when: new Date().toISOString(),
      summary,
      rows,
    },
    null,
    2,
  ),
);
console.log(`wrote ${path.join(TMP, "out-proposal.json")}`);
