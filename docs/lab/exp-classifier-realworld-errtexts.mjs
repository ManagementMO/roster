#!/usr/bin/env node
/**
 * exp-classifier-realworld part (c): realistic real-world error texts driven
 * through a REAL MCP server (lab fail-server echo_error → isError:true over
 * actual stdio) → BackendManager evidence → classifyOutcome kind.
 * Each text is modeled verbatim-or-near-verbatim on a real API's error body.
 * expected = the MCP-Atlas-family kind the spec taxonomy intends (auth, quota,
 * timeout, schema, internal, other); ambiguous cases list alternatives.
 *
 * Output: docs/lab/tmp-classifier-realworld/out-errtexts.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(path.join(repo, "packages/cli/package.json"));
const { BackendManager } = await import(req.resolve("@rosterhq/router"));
const { classifyOutcome } = await import(req.resolve("@rosterhq/coach"));

const TMP = path.join(repo, "docs/lab/tmp-classifier-realworld");
fs.mkdirSync(TMP, { recursive: true });
const FAILSERVER = path.join(repo, "docs/lab/exp-classifier-realworld-failserver.mjs");

/** [source, realistic error text, expectedKinds (first = primary intent)] */
const CASES = [
  // — quota / rate limit family —
  ["github-403-rate-limit (verbatim docs text)",
    "API rate limit exceeded for 203.0.113.7. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)",
    ["quota"]],
  ["github-secondary-rate-limit",
    "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
    ["quota"]],
  ["openai-insufficient-quota",
    "You exceeded your current quota, please check your plan and billing details.",
    ["quota"]],
  ["openai-429-tpm",
    "Rate limit reached for gpt-4o in organization org-Abc123 on tokens per min (TPM): Limit 30000, Used 29869, Requested 654. Please try again in 1.046s.",
    ["quota"]],
  ["google-api-quota",
    "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service 'customsearch.googleapis.com'.",
    ["quota"]],
  ["http-429-plain", "429 Too Many Requests", ["quota"]],
  ["npm-registry-quota", "Monthly download quota exceeded for package @scope/name.", ["quota"]],
  // — auth family —
  ["slack-invalid-auth", "Slack API error: invalid_auth", ["auth"]],
  ["slack-not-authed", "An API error occurred: not_authed", ["auth"]],
  ["github-bad-credentials", "Bad credentials", ["auth"]],
  ["anthropic-401", "authentication_error: invalid x-api-key", ["auth"]],
  ["aws-invalid-token", "The security token included in the request is invalid.", ["auth"]],
  ["aws-signature-expired",
    "Signature expired: 20260704T000000Z is now earlier than 20260704T010000Z (20260704T011500Z - 15 min.)",
    ["auth"]],
  ["git-auth-failed", "fatal: Authentication failed for 'https://github.com/o/r.git/'", ["auth"]],
  ["notion-invalid-token", "API token is invalid.", ["auth"]],
  ["google-oauth-invalid-grant", "invalid_grant: Token has been expired or revoked.", ["auth"]],
  ["http-403-plain", "403 Forbidden", ["auth"]],
  ["eacces", "EACCES: permission denied, open '/etc/hosts'", ["auth"]],
  ["fs-server-access-denied (real text captured in part a S2)",
    "Access denied - path outside allowed directories: /private/tmp/x.txt not in /tmp/sandbox",
    ["auth"]],
  // — timeout family —
  ["node-etimedout", "connect ETIMEDOUT 10.0.0.1:443", ["timeout"]],
  ["generic-timed-out", "The operation timed out after 30000 milliseconds with 0 bytes received", ["timeout"]],
  ["gateway-timeout", "504 Gateway Time-out", ["timeout"]],
  // — schema family —
  ["sdk-invalid-arguments",
    "Invalid arguments for tool create_entities: expected array, received string at path 'entities'",
    ["schema"]],
  ["missing-required-param", "Missing required parameter: 'query'", ["schema"]],
  ["zod-must-be-type", "Validation failed: name must be of type string", ["schema"]],
  // — internal family —
  ["http-500-plain", "Request failed with status code 500", ["internal"]],
  ["internal-server-error", "Internal server error occurred while processing your request.", ["internal"]],
  ["panic", "panic: runtime error: invalid memory address or nil pointer dereference", ["internal"]],
  ["http-503", "503 Service Unavailable: back-off and retry in 30 seconds", ["internal", "other"]],
  // — other / not-found family —
  ["slack-channel-not-found", "An API error occurred: channel_not_found", ["other"]],
  ["enoent", "ENOENT: no such file or directory, open '/data/config.json'", ["other"]],
  ["econnrefused", "connect ECONNREFUSED 127.0.0.1:5432", ["other"]],
  ["sqlite-locked", "SQLITE_BUSY: database is locked", ["other"]],
  ["http-402", "402 Payment Required", ["quota", "other"]],
  ["stripe-card-declined", "Your card was declined.", ["other"]],
  // — trap texts: neutral errors that merely MENTION trigger words —
  ["json-parse-unexpected-token (upstream returned HTML)",
    "Unexpected token < in JSON at position 0",
    ["other", "internal"]],
  ["llm-context-length",
    "This model's maximum context length is 128000 tokens. However, your messages resulted in 143021 tokens.",
    ["other", "quota"]],
  ["enoent-token-filename", "ENOENT: no such file or directory, open '/home/u/.config/auth-tokens.json'", ["other"]],
  ["oauth-refresh-rate-limited", "Failed to refresh access token: rate limit exceeded", ["quota", "auth"]],
];

const t0 = Date.now();
const mgr = new BackendManager();
const tools = await mgr.connect({ name: "lab", command: "node", args: [FAILSERVER] });
const backend = tools[0].source;
console.log(`# part (c): ${CASES.length} realistic error texts through real isError wire`);

const rows = [];
for (const [source, text, expected] of CASES) {
  const outcome = await mgr.call(backend, "echo_error", { text }, undefined);
  const cls = classifyOutcome(outcome.evidence);
  const actualKind = cls.startsWith("tool_fail:") ? cls.slice("tool_fail:".length) : cls;
  const ok = expected.includes(actualKind);
  rows.push({
    source,
    text,
    expectedKinds: expected,
    evidence: outcome.evidence,
    class: cls,
    actualKind,
    match: ok,
    primaryMatch: actualKind === expected[0],
  });
  console.log(`  [${ok ? "ok" : "MIS"}] ${source}: → ${actualKind} (expected ${expected.join("|")})`);
}
await mgr.close();

const mis = rows.filter((r) => !r.match);
const misPrimary = rows.filter((r) => !r.primaryMatch);
const summary = {
  total: rows.length,
  matchedAny: rows.length - mis.length,
  misclassified: mis.length,
  misRateAnyPct: +((100 * mis.length) / rows.length).toFixed(1),
  misPrimary: misPrimary.length,
  misRatePrimaryPct: +((100 * misPrimary.length) / rows.length).toFixed(1),
  misclassifiedList: mis.map((r) => `${r.source}: expected ${r.expectedKinds.join("|")} got ${r.actualKind}`),
};
console.log(`\nsummary: ${summary.matchedAny}/${summary.total} within expected set; ${summary.misclassified} misclassified (${summary.misRateAnyPct}%)`);

fs.writeFileSync(
  path.join(TMP, "out-errtexts.json"),
  JSON.stringify(
    { experiment: "classifier-realworld part (c) — realistic error texts", when: new Date().toISOString(), wallMs: Date.now() - t0, summary, rows },
    null,
    2,
  ),
);
console.log(`wrote ${path.join(TMP, "out-errtexts.json")}`);
process.exit(0);
