export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 9.6;

export const COLOR = {
  paper: "#F7F8FA",
  white: "#FFFFFF",
  ink: "#070A10",
  slate: "#576170",
  line: "#DCE2EA",
  blue: "#246BFD",
  blueDeep: "#1649B8",
  green: "#22A66F",
  amber: "#E8A62D",
};

export const FONT = "Inter, SF Pro Display, Avenir Next, Helvetica Neue, Arial, sans-serif";
export const MONO = "SFMono-Regular, JetBrains Mono, Menlo, Consolas, monospace";

export const TIMELINE = {
  impact: [0, 1.42],
  compression: [1.18, 3.22],
  selection: [2.84, 5.28],
  lineup: [4.86, 7.46],
  identity: [7.12, 9.6],
};

export const STARTERS = [
  { id: "github", name: "GitHub", capability: "Search code", color: COLOR.blue, glyph: "source" },
  { id: "filesystem", name: "Filesystem", capability: "Read + patch", color: COLOR.blueDeep, glyph: "patch" },
  { id: "playwright", name: "Playwright", capability: "Verify behavior", color: COLOR.blue, glyph: "verify" },
  { id: "linear", name: "Linear", capability: "Update issue", color: COLOR.amber, glyph: "issue" },
  { id: "postgres", name: "Postgres", capability: "Inspect data", color: COLOR.green, glyph: "inspect" },
];
