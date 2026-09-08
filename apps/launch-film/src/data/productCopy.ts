export const PRODUCT_COPY = {
  name: "ROSTER",
  hookLead: "YOUR AGENT HAS",
  hookCount: "200 TOOLS.",
  hookResolve: "ONLY FIVE GET TO START.",
  task: "Trace the checkout error, patch it, verify in browser, update the issue.",
  inspectCommand: "codex mcp list",
  initCommand: "roster init",
  launchCommand: "node packages/cli/dist/bin.js init",
  launchQualifier: "PRE-RELEASE · LOCAL CHECKOUT",
  finalTagline: "YOUR AGENT HAS 200 TOOLS. ONLY FIVE GET TO START.",
  localClaim: "LOCAL OUTCOMES · ONE CLEAN ENDPOINT",
  sixthManState: "SUGGESTED · AWAITING AGENT",
  leagueState: "PRE-SEASON · 0/8 CERTIFIED · NO RANK",
} as const;

export const REPRESENTATIVE_SERVERS = [
  "github",
  "filesystem",
  "postgres",
  "playwright",
  "linear",
  "slack",
  "notion",
  "sentry",
  "stripe",
  "memory",
] as const;
