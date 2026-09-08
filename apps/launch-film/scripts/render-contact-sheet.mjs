import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const outputRoot = process.env.ROSTER_FILM_OUTPUT ?? "out";
const output = resolve(outputRoot, "roster-launch-redesign-contact-sheet.png");
const render = spawnSync(
  "pnpm",
  [
    "exec", "remotion", "still", "src/index.ts", "RosterLaunchContactSheet", output,
    "--image-format=png", "--overwrite",
  ],
  { stdio: "inherit" },
);
if (render.status !== 0) process.exit(render.status ?? 1);

console.log(`Rendered contact sheet to ${output}`);
