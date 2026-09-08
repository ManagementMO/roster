export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 12.4;

export const COLOR = {
  paper: "#F5F1E9",
  white: "#FFFDF8",
  ink: "#151617",
  graphite: "#292825",
  slate: "#77766F",
  line: "#D8D1C5",
  // Legacy names kept for scene compatibility. The film's authored accent is
  // now a quiet mineral glass rather than a warm brass/orange signal.
  blue: "#B6C0BB",
  blueSoft: "#E7EEE9",
  green: "#6B846F",
  success: "#42B879",
  amber: "#C49A5A",
  red: "#C86E61",
  brass: "#B6C0BB",
  brassLight: "#E7EEE9",
  glass: "#B6C0BB",
  glassLight: "#E7EEE9",
  glassDim: "#6E7B76",
  glassTrack: "#353D39",
  // Semantic brand colours: these are reserved for native product marks, not
  // general UI chrome or routing lines.
  roster: "#B97945",
  rosterLight: "#E7CBA9",
  filesystem: "#C88767",
  copper: "#C88767",
  copperLight: "#EBC9B6",
  sage: "#6B846F",
  clay: "#B96E5C",
  github: "#181717",
  playwright: "#2D4552",
  linear: "#5E6AD2",
  postgres: "#336791",
  claude: "#D97757",
};

// Avenir Next gives the launch film a more deliberate editorial/product voice
// while retaining resilient fallbacks for non-macOS render environments.
export const FONT = "Avenir Next, SF Pro Display, Inter, Helvetica Neue, Arial, sans-serif";
export const MONO = "SFMono-Regular, JetBrains Mono, Menlo, Consolas, monospace";

export const TIMELINE = {
  hook: [0, 1.35],
  terminal: [1.35, 4.55],
  focus: [4.55, 7.35],
  call: [7.35, 10.3],
  identity: [10.3, DURATION],
};

export const TERMINAL_LINES = [
  { kind: "prompt", text: "$ npx roster init" },
  { kind: "success", text: "✓ local router ready" },
  { kind: "info", text: "→ 200 capabilities discovered" },
  { kind: "prompt", text: "$ roster sync --five" },
  { kind: "success", text: "✓ one endpoint · five starters" },
];

export const STARTERS = [
  { id: "github", name: "GitHub", capability: "search code", color: COLOR.github, source: "simple-icons" },
  { id: "filesystem", name: "Filesystem", capability: "read + patch", color: COLOR.filesystem, source: "native glyph" },
  { id: "playwright", name: "Playwright", capability: "verify behavior", color: COLOR.playwright, source: "official SVG" },
  { id: "linear", name: "Linear", capability: "update issue", color: COLOR.linear, source: "simple-icons" },
  { id: "postgresql", name: "Postgres", capability: "inspect data", color: COLOR.postgres, source: "simple-icons" },
];

// Routing paths are deliberately separate from tool brand colours. They read
// as one glass material family while giving each traversal a clean, legible
// signal in the terminal-to-universe handoff.
export const TERMINAL_ROUTE_COLORS = [
  "#E58A67", // GitHub: warm coral
  "#6FC8A8", // Playwright: mint
  "#78B8E8", // Linear: clear sky
];

// Real local SVG marks used only as an ecosystem orbit in the final identity beat.
// The chip surfaces stay quiet so the orbit reads as one system, not a logo collage.
export const ORBIT_MARKS = [
  { id: "github", label: "GitHub" },
  { id: "slack", label: "Slack" },
  { id: "notion", label: "Notion" },
  { id: "figma", label: "Figma" },
  { id: "vercel", label: "Vercel" },
  { id: "asana", label: "Asana" },
  { id: "jira", label: "Jira" },
  { id: "miro", label: "Miro" },
  { id: "airtable", label: "Airtable" },
  { id: "sentry", label: "Sentry" },
  { id: "stripe", label: "Stripe" },
  { id: "redis", label: "Redis" },
  { id: "cloudflare", label: "Cloudflare" },
  { id: "supabase", label: "Supabase" },
  { id: "playwright", label: "Playwright" },
  { id: "linear", label: "Linear" },
  { id: "postgresql", label: "PostgreSQL" },
];

export const ORBIT_COLORS = {
  github: "#181717",
  slack: "#4A154B",
  notion: "#000000",
  figma: "#F24E1E",
  vercel: "#000000",
  asana: "#F06A6A",
  jira: "#1868DB",
  miro: "#FFD02F",
  airtable: "#18BFFF",
  sentry: "#362D59",
  stripe: "#635BFF",
  redis: "#DC382D",
  cloudflare: "#F38020",
  supabase: "#3ECF8D",
  playwright: "#2D4552",
  linear: "#5E6AD2",
  postgresql: "#4169E1",
};

export const BRAND_META = {
  github: { label: "GitHub", pathKey: "github", viewBox: [0, 0, 24, 24] },
  playwright: { label: "Playwright", pathKey: "playwright", viewBox: [0, 0, 400, 400] },
  linear: { label: "Linear", pathKey: "linear", viewBox: [0, 0, 24, 24] },
  postgresql: { label: "PostgreSQL", pathKey: "postgresql", viewBox: [0, 0, 24, 24] },
  claude: { label: "Claude", pathKey: "claude", viewBox: [0, 0, 24, 24] },
};
