import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_ROOT = path.join(APP_ROOT, "assets", "brands");
const OUTPUT = path.join(APP_ROOT, "src", "real", "brandPaths.js");
const NAMES = [
  "github",
  "slack",
  "notion",
  "figma",
  "vercel",
  "asana",
  "jira",
  "miro",
  "airtable",
  "sentry",
  "stripe",
  "redis",
  "cloudflare",
  "supabase",
  "playwright",
  "linear",
  "postgresql",
  // Claude is used as the agent identity in the terminal/request card, but
  // intentionally does not appear in the final integration orbit.
  "claude",
];

function attr(source, name) {
  const match = source.match(new RegExp(`${name}=[\\\"']([^\\\"']+)[\\\"']`));
  return match?.[1] ?? "";
}

function parseSvg(name) {
  const source = readFileSync(path.join(ASSET_ROOT, `${name}.svg`), "utf8");
  const viewBox = attr(source.slice(0, source.indexOf(">") + 1), "viewBox");
  const [minX, minY, width, height] = viewBox.split(/\s+/).map(Number);
  const paths = [...source.matchAll(/<path\b([^>]*)>/g)].map((match) => ({
    d: attr(match[1], "d"),
    fill: attr(match[1], "fill") || "currentColor",
  })).filter((pathData) => pathData.d.length > 0);
  if (!Number.isFinite(width) || paths.length === 0) throw new Error(`Could not parse ${name}.svg`);
  return { viewBox: [minX, minY, width, height], paths };
}

const data = Object.fromEntries(NAMES.map((name) => [name, parseSvg(name)]));
mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `// Generated from local SVG assets by scripts/make-brand-paths.mjs.\nexport const BRAND_PATHS = ${JSON.stringify(data, null, 2)};\n`);
console.log(`Generated ${OUTPUT}`);
