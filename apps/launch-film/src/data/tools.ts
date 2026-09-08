import { makeSeededRandom, randomBetween } from "../utils/seededRandom";

export type ToolCardData = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly symbol: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly taskFit: number;
  readonly reliability: number;
  readonly latencyMs: number;
  readonly selected: boolean;
  readonly benchRank?: number;
};

const STARTER_IDS = new Set([
  "github__search_code",
  "filesystem__read_text_file",
  "sentry__get_issue_details",
  "playwright__browser_snapshot",
  "linear__update_issue",
]);

const NAMES: readonly [string, string, string][] = [
  ["github__search_code", "Search code", "repository"],
  ["filesystem__read_text_file", "Read text file", "filesystem"],
  ["sentry__get_issue_details", "Get issue details", "diagnostics"],
  ["playwright__browser_snapshot", "Browser snapshot", "browser"],
  ["linear__update_issue", "Update issue", "planning"],
  ["git__search_repository", "Search repository", "repository"],
  ["github__get_pull_request", "Get pull request", "repository"],
  ["filesystem__edit_file", "Edit file", "filesystem"],
  ["playwright__browser_click", "Browser click", "browser"],
  ["linear__create_comment", "Create comment", "planning"],
  ["sentry__trace_event", "Trace event", "diagnostics"],
  ["postgres__query", "Query database", "database"],
  ["sqlite__execute", "Execute query", "database"],
  ["slack__search_messages", "Search messages", "communication"],
  ["notion__search_pages", "Search pages", "knowledge"],
  ["stripe__list_payments", "List payments", "commerce"],
  ["docker__list_containers", "List containers", "infrastructure"],
  ["kubernetes__get_pods", "Get pods", "infrastructure"],
  ["aws__filter_logs", "Filter logs", "diagnostics"],
  ["fetch__get_url", "Fetch URL", "network"],
  ["memory__search_nodes", "Search memory", "knowledge"],
  ["calendar__list_events", "List events", "productivity"],
  ["email__search_threads", "Search threads", "communication"],
  ["sheets__lookup_rows", "Lookup rows", "data"],
  ["jira__find_issues", "Find issues", "planning"],
  ["shell__run_command", "Run command", "runtime"],
  ["time__current_time", "Current time", "utility"],
  ["maps__search_places", "Search places", "location"],
  ["vector__semantic_search", "Semantic search", "knowledge"],
  ["browser__take_screenshot", "Take screenshot", "browser"],
];

const symbolFor = (category: string): string =>
  ({
    repository: "⌁",
    filesystem: "⌜",
    diagnostics: "◇",
    browser: "◎",
    planning: "↗",
    database: "▤",
    communication: "◌",
    knowledge: "✦",
    commerce: "◫",
    infrastructure: "⬡",
    network: "⇄",
    productivity: "□",
    data: "≋",
    runtime: ">_",
    utility: "·",
    location: "⌖",
  })[category] ?? "·";

const makeTool = ([id, name, category]: readonly [string, string, string], index: number): ToolCardData => {
  const random = makeSeededRandom(`roster-tool-${id}`);
  const selected = STARTER_IDS.has(id);
  return {
    id,
    name,
    category,
    symbol: symbolFor(category),
    position: [
      randomBetween(random, -760, 760),
      randomBetween(random, -360, 360),
      randomBetween(random, -480, 520),
    ],
    rotation: [
      randomBetween(random, -7, 7),
      randomBetween(random, -12, 12),
      randomBetween(random, -4, 4),
    ],
    taskFit: selected ? 0.91 + index * 0.006 : randomBetween(random, 0.18, 0.79),
    reliability: selected ? randomBetween(random, 0.88, 0.98) : randomBetween(random, 0.54, 0.91),
    latencyMs: Math.round(randomBetween(random, 42, 840)),
    selected,
    ...(id === "git__search_repository" ? { benchRank: 1 } : {}),
  };
};

export const DETAILED_TOOLS: readonly ToolCardData[] = NAMES.map(makeTool);
export const STARTING_FIVE = DETAILED_TOOLS.filter((tool) => tool.selected);

const bench = DETAILED_TOOLS.find((tool) => tool.id === "git__search_repository");
if (!bench) throw new Error("Sixth Man tool missing from deterministic universe");
export const BENCH_TOOL = bench;

export type AmbientTool = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly strength: number;
};

export const AMBIENT_TOOLS: readonly AmbientTool[] = Array.from({ length: 96 }, (_, index) => {
  const random = makeSeededRandom(`ambient-tool-${index}`);
  return {
    id: `ambient-${String(index + 1).padStart(3, "0")}`,
    x: randomBetween(random, -980, 980),
    y: randomBetween(random, -520, 520),
    z: randomBetween(random, -900, 480),
    width: randomBetween(random, 36, 118),
    strength: randomBetween(random, 0.12, 0.72),
  };
});
