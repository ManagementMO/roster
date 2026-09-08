export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 57;

export const COLOR = {
  paper: "#F5F7FA",
  warm: "#FFFCF7",
  white: "#FFFFFF",
  ink: "#080B12",
  inkSoft: "#171B24",
  slate: "#525C6C",
  muted: "#8B94A3",
  line: "#D9E0E9",
  violet: "#496BE8",
  ultraviolet: "#3156C8",
  blue: "#2368E8",
  cyan: "#4A9DE8",
  mint: "#22A66F",
  coral: "#EF5A5A",
  amber: "#E9A62F",
};

export const FONT = "Inter, SF Pro Display, Avenir Next, Helvetica Neue, Arial, sans-serif";
export const MONO = "SFMono-Regular, JetBrains Mono, Menlo, Consolas, monospace";

export const TIMELINE = {
  hook: [0, 3.4],
  terminal: [2.72, 8.9],
  universe: [8.08, 16.0],
  initialize: [15.28, 21.2],
  search: [20.4, 29.35],
  clear: [28.62, 35.2],
  starters: [34.38, 42.25],
  call: [41.5, 46.05],
  sixth: [45.55, 49.72],
  coach: [49.05, 53.55],
  final: [52.65, 57],
};

export const TOOLS = [
  { id: "github", name: "GitHub", capability: "Search code", role: "SOURCE", color: COLOR.blue, score: 92, glyph: "source" },
  { id: "filesystem", name: "Filesystem", capability: "Read + patch", role: "WORKSPACE", color: COLOR.violet, score: 88, glyph: "patch" },
  { id: "playwright", name: "Playwright", capability: "Verify behavior", role: "BROWSER", color: COLOR.cyan, score: 96, glyph: "verify" },
  { id: "linear", name: "Linear", capability: "Update issue", role: "PLANNING", color: COLOR.amber, score: 84, glyph: "issue" },
  { id: "postgres", name: "Postgres", capability: "Inspect data", role: "DATABASE", color: COLOR.mint, score: 73, glyph: "inspect" },
  { id: "sentry", name: "Sentry", capability: "Observe failure", role: "SIXTH MAN", color: COLOR.coral, score: 68, glyph: "observe" },
];

export const SEARCH_METRICS = ["TASK FIT", "RELIABILITY", "LATENCY", "OUTCOME HISTORY"];
