export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 11.6;

export const COLOR = {
  black: "#050506",
  ink: "#0B0B0D",
  panel: "#111114",
  panel2: "#17171B",
  cream: "#F4F0E8",
  white: "#FFFDF8",
  muted: "#9A9790",
  dim: "#5F5D5A",
  line: "#343438",
  warm: "#F29A72",
  warmSoft: "#C87B5E",
  mint: "#A6D7C5",
  blue: "#A9B9F4",
  violet: "#C5B4E8",
  red: "#E78078",
};

export const FONT = "Iowan Old Style, Baskerville, Georgia, Times New Roman, serif";
export const SANS = "Avenir Next, SF Pro Display, Inter, Helvetica Neue, Arial, sans-serif";
export const MONO = "SFMono-Regular, JetBrains Mono, Menlo, Consolas, monospace";

export const TIMELINE = {
  hook: [0, 1.35],
  terminal: [1.35, 3.45],
  resolve: [3.45, 4.7],
  dive: [4.7, 6.3],
  route: [6.3, 8.15],
  memory: [8.15, 9.45],
  identity: [9.45, DURATION],
};

export const TERMINAL = {
  command: "$ roster route \"verify checkout flow\"",
  lines: [
    { text: "intent received", color: COLOR.muted },
    { text: "local router online", color: COLOR.mint },
    { text: "200 capabilities in scope", color: COLOR.muted },
    { text: "ranking by fit · reliability · outcome", color: COLOR.cream },
  ],
};

export const CANDIDATES = [
  { id: "github", label: "GitHub", detail: "search code", color: COLOR.cream, fit: "0.72" },
  { id: "postgresql", label: "Postgres", detail: "inspect data", color: COLOR.blue, fit: "0.81" },
  { id: "playwright", label: "Playwright", detail: "verify behavior", color: COLOR.mint, fit: "0.96" },
];

// These are real local, agent-facing ecosystem integrations. They are used as
// a quiet end-state orbit rather than a wall of UI cards.
export const ORBIT_MARKS = [
  { id: "github", label: "GitHub", color: "#F4F0E8" },
  { id: "slack", label: "Slack", color: "#D98FD0" },
  { id: "notion", label: "Notion", color: "#F4F0E8" },
  { id: "figma", label: "Figma", color: "#F29A72" },
  { id: "linear", label: "Linear", color: "#A9B9F4" },
  { id: "sentry", label: "Sentry", color: "#C5B4E8" },
  { id: "stripe", label: "Stripe", color: "#9C93F4" },
  { id: "airtable", label: "Airtable", color: "#8CD4F0" },
  { id: "supabase", label: "Supabase", color: "#A6D7C5" },
  { id: "playwright", label: "Playwright", color: "#E78078" },
  { id: "asana", label: "Asana", color: "#F09A96" },
  { id: "jira", label: "Jira", color: "#A9B9F4" },
];

export const ORBIT_COLORS = Object.fromEntries(ORBIT_MARKS.map((mark) => [mark.id, mark.color]));
