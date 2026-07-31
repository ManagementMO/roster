/**
 * Roster launch film — the single source of product truth.
 *
 * EVERY word the film puts on screen comes from this file, and every claim here
 * is traceable to a file in this repository. Scenes import strings; they never
 * author them. If a claim cannot be sourced below, it does not go in the film.
 *
 * Provenance keys used in the comments:
 *   README      — /README.md
 *   STATUS      — /STATUS-FOR-MO.md   (newest status doc; wins on disagreement)
 *   ROSTER      — /ROSTER.md          (strategy + glossary)
 *   SRC:<path>  — the implementation itself
 *
 * Two deliberate corrections where the older strategy doc disagrees with the
 * shipped code, resolved in favour of the newer source (per STATUS §2 D6/P8):
 *   · ROSTER §7.1 calls the Sixth Man "automatic failover". The code is
 *     suggest-only (SRC:packages/router/src/rosterServer.ts `sixthManSuggestion`,
 *     "Roster never auto-fires a second tool; the agent decides"). The film
 *     shows a suggestion awaiting the agent, never an automatic substitution.
 *   · ROSTER §7.1 claims "stdio + streamable HTTP". STATUS §4D records HTTP as
 *     unbuilt and serve as stdio-only. The film says stdio.
 */

/**
 * The launch command.
 *
 * Verified against SRC:packages/cli/package.json (`"bin": {"roster": ...}`) and
 * SRC:packages/cli/src/bin.ts (the `init` case and the HELP block). This is the
 * command that exists today.
 *
 * It is deliberately NOT shown as `npx roster init`, even though README's
 * quickstart prints that form: README itself flags those lines as "the planned
 * install path rather than commands that work today", and STATUS P1 records that
 * npm `roster` is a THIRD-PARTY package (roster@0.0.3, verified 2026-07-07).
 * SRC:packages/cli/src/entry.ts refuses to write that npx form for exactly this
 * reason. Showing it in a launch film would advertise fetching a stranger's code.
 *
 * Defined once, here. No scene may hard-code a command string.
 */
export const LAUNCH_COMMAND = "roster init";

/** The honest qualifier that travels with the command in the final reveal. */
export const LAUNCH_COMMAND_NOTE = "Pre-release · not yet published to npm";

/** README line 3, verbatim. The film's whole premise. */
export const TAGLINE = "Your agent has 200 tools. Only five get to start.";

/** The hook, set as two lines. Same sentence as TAGLINE, broken for the frame. */
export const HOOK_LINES = ["YOUR AGENT HAS 200 TOOLS.", "ONLY FIVE GET TO START."] as const;

/** README line 5. */
export const ONE_LINER = "A neutral, open-source, local-first tool router for AI agents.";

/**
 * Terminal beat. `roster init` really does discover → import → receipt, with no
 * network, account, or model download (SRC:packages/cli/src/init.ts).
 *
 * The output lines below are the shape SRC:packages/cli/src/receipt.ts prints,
 * with representative counts. They are illustrative of one machine's run — the
 * film labels them as such — not a recording of a specific user's output.
 */
export const TERMINAL = {
  prompt: "~",
  command: LAUNCH_COMMAND,
  /** Rendered inside the receipt rule, matching renderReceipt()'s own header. */
  receiptTitle: "ROSTER · Day-0 receipt",
  lines: [
    "Claude Code     14 server(s)   ~/.claude.json",
    "                schemas natively deferred, not loaded",
    "Cursor           9 server(s)   ~/.cursor/mcp.json",
    "Codex            6 server(s)   ~/.codex/config.toml",
    "",
    "Unique servers across clients: 23",
    "Skills discovered: 31  (2 flagged for review)",
  ] as const,
  /** SRC:packages/cli/src/init.ts, final line of `init()`. */
  closing: "Then point any agent at: roster serve",
  /** Honest framing so no viewer reads the numbers as a measured benchmark. */
  disclaimer: "Illustrative run · counts are read from your own configs",
} as const;

/** Scene 3 — overload. The numbers are cited, not invented. */
export const OVERLOAD = {
  eyebrow: "THE HAYSTACK",
  headline: "Every schema, every turn.",
  /** README §Why, citing agentmarketcap.ai. */
  stat: "Tool schemas can eat 72% of a 200K context window before the first question.",
  /** README §Why, citing writer.com. */
  statTwo: "Selection accuracy falls from 43% to ~13.6% as toolsets grow.",
  cite: "Sources cited in README",
} as const;

/** Scene 4 — initialization. */
export const INITIALIZE = {
  eyebrow: "THE ROTATION",
  /** ROSTER glossary: "The Rotation | The aggregating router itself". */
  headline: "N entries become one.",
  lede: "Your local MCP servers front onto a single Roster endpoint. Nothing leaves the machine.",
  /** README §Privacy + STATUS §5 (serve is stdio-only). */
  proof: "Local stdio · no account · no API key",
} as const;

/** Scene 5 — search. The four signals, in the order the router applies them. */
export const SEARCH = {
  eyebrow: "DRAFT",
  /** ROSTER glossary: "Draft (verb) | The `draft(need)` meta-tool call that picks the five". */
  headline: "draft(need)",
  lede: "Roster reads the task and ranks what it has.",
  /**
   * Each signal below is implemented:
   *  · task fit        — FTS5 lexical + dense hybrid fusion (STATUS §5 Coach)
   *  · reliability     — Wilson ratings from local outcomes (STATUS §5 Coach)
   *  · latency         — latencyMs recorded per call (SRC:router/rosterServer.ts)
   *  · outcome history — OATS over derived outcome classes (STATUS §5 Coach)
   */
  signals: [
    { key: "fit", label: "TASK FIT", detail: "lexical + dense retrieval over the aggregated index" },
    { key: "reliability", label: "RELIABILITY", detail: "Wilson lower bound on local outcomes" },
    { key: "latency", label: "LATENCY", detail: "measured per call, on your machine" },
    { key: "history", label: "OUTCOME HISTORY", detail: "what worked on your stack, not someone else's" },
  ] as const,
} as const;

/** Scene 6 — clearing. */
export const CLEARING = {
  eyebrow: "THE CUT",
  headline: "The rest go to the bench.",
  /** ROSTER glossary: "Benched | Demoted from default rosters". */
  lede: "Nothing is deleted. Benched capabilities stay indexed and can be drafted the moment the task changes.",
} as const;

/**
 * Scene 7 — the starting five.
 *
 * These are five real, widely-used open-source MCP servers, described by what
 * they do. No performance claim, no score, no ranking number is attached to any
 * of them — the film never implies Roster has certified or ranked these.
 * `filesystem` is the suite this repo actually ships (suites/filesystem).
 */
export const STARTERS = [
  { no: "01", name: "filesystem", capability: "read · write · search", glyph: "folder" },
  { no: "02", name: "git", capability: "diff · log · blame", glyph: "branch" },
  { no: "03", name: "fetch", capability: "retrieve a URL as text", glyph: "globe" },
  { no: "04", name: "memory", capability: "notes across sessions", glyph: "layers" },
  { no: "05", name: "sqlite", capability: "query a database", glyph: "database" },
] as const;

export const STARTING_FIVE = {
  eyebrow: "THE STARTING FIVE",
  headline: "Five capabilities. One endpoint.",
  /** README §What it is: draft returns the best ≤5, K configurable 1–10. */
  lede: "K is configurable from one to ten. Five is the brand.",
} as const;

/** Scene 8 — the tool call. */
export const TOOL_CALL = {
  eyebrow: "CALL",
  headline: "Every call goes through Roster.",
  /** SRC:packages/router/src/rosterServer.ts — call() proxies and records. */
  lede: "The agent calls once. Roster proxies to the backend, returns the result, and keeps the outcome.",
  agent: "AGENT",
  core: "ROSTER",
  target: "filesystem",
  request: "call(tool, args)",
  result: "result",
} as const;

/** Scene 9 — the Sixth Man. Suggest-only, and the film says so in words. */
export const SIXTH_MAN = {
  eyebrow: "THE SIXTH MAN",
  headline: "A starter fails. Roster suggests.",
  /**
   * Verbatim behaviour from SRC:packages/router/src/rosterServer.ts: on a hard
   * failure the router appends `_roster.suggested_alternate` with `tool`,
   * `reason` and `args_compatible`, and records the suggestion. It does not call
   * the alternate. STATUS P8 records auto-substitution as an OPEN decision.
   */
  suggestedLabel: "SUGGESTED",
  awaitingLabel: "AWAITING AGENT",
  acceptedLabel: "AGENT ACCEPTED",
  payload: "_roster.suggested_alternate",
  truth: "Suggest-only. Roster never executes the alternate — the agent decides.",
  failedName: "fetch",
  alternateName: "http-get",
  alternateCapability: "retrieve a URL",
} as const;

/** Scene 10 — Coach and League. Both claims are deliberately narrow. */
export const COACH_LEAGUE = {
  coach: {
    eyebrow: "THE COACH",
    headline: "It learns your stack.",
    /** README §What it is + STATUS §5. Outcome class, latency, hashes, drift. */
    lede: "Outcome class, latency and drift are recorded on-device. Prompts, arguments and results are not.",
    axis: "local outcomes → routing preference",
  },
  league: {
    eyebrow: "THE LEAGUE",
    headline: "Certified by the Combine.",
    /**
     * The only League number this film shows is the Combine result this repo
     * actually contains: 8/8 against a real filesystem server, deterministic
     * (STATUS §1, docs/verification/*-filesystem-lab-results.json).
     * Standings are PRE-SEASON until a human signing session (STATUS §3.1, §7),
     * and the film says the word "pre-season" on screen for exactly that reason.
     */
    suite: "suites/filesystem",
    result: "8 / 8",
    resultLabel: "tasks passed · deterministic",
    status: "PRE-SEASON",
    truth: "No named score publishes until a human signs the run. Unsigned results never back a ranking.",
  },
} as const;

/** Scene 11 — the reveal. */
export const REVEAL = {
  wordmark: "ROSTER",
  tagline: TAGLINE,
  command: LAUNCH_COMMAND,
  note: LAUNCH_COMMAND_NOTE,
  license: "MIT · open source",
} as const;

/**
 * Every distinct claim the film makes, with its source. The QA sheet renders
 * this table, so a reviewer can check the film against the repo without reading
 * the scene code.
 */
export const CLAIM_LEDGER = [
  { claim: "Local-first; no account, no API key", source: "README §Privacy" },
  { claim: "One endpoint fronts local stdio MCP servers and approved skills", source: "README §What it is" },
  { claim: "draft(need) returns the best ≤5 capabilities; K configurable 1–10", source: "README §What it is" },
  { claim: "call(tool, args) proxies the invocation and records the outcome", source: "packages/router/src/rosterServer.ts" },
  { claim: "Coach stores outcome class, latency, hashes and drift — not prompts, args or results", source: "README §What it is · STATUS §5" },
  { claim: "Sixth Man is suggest-only; Roster never executes the alternate", source: "packages/router/src/rosterServer.ts · STATUS P8" },
  { claim: "Playbook discovers and parses SKILL.md; review-flagged skills are withheld by default", source: "README §What it is · STATUS §5" },
  { claim: "Combine ran 8/8 deterministic against a real filesystem server", source: "STATUS §1 · docs/verification/" },
  { claim: "League standings are pre-season until a human signing session", source: "STATUS §3.1 · §7" },
  { claim: "roster init discovers clients, imports servers, prints the Day-0 receipt", source: "packages/cli/src/bin.ts · init.ts" },
  { claim: "Not yet published to npm", source: "README §Quickstart · STATUS P1" },
  { claim: "Context/accuracy statistics are quoted from cited third-party research", source: "README §Why" },
] as const;
