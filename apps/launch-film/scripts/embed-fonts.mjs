import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const fonts = [
  { family: "Roster Display", file: "SpaceGrotesk-Variable.woff2", weight: "300 700" },
  { family: "Roster UI", file: "Manrope-Variable.woff2", weight: "300 800" },
  { family: "Roster Mono", file: "JetBrainsMono-Variable.woff2", weight: "300 800" },
];

const rules = fonts.map(({ family, file, weight }) => {
  const source = fs.readFileSync(path.join(appDirectory, "public/fonts", file)).toString("base64");
  return [
    "@font-face {",
    `  font-family: "${family}";`,
    `  src: url("data:font/woff2;base64,${source}") format("woff2");`,
    `  font-weight: ${weight};`,
    "  font-style: normal;",
    "  font-display: block;",
    "}",
  ].join("\n");
});

const output = path.join(appDirectory, "src/generated/fonts.css");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${rules.join("\n\n")}\n`);
process.stdout.write(`Embedded ${fonts.length} local WOFF2 fonts in ${path.relative(appDirectory, output)}\n`);
