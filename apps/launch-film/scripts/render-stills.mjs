import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const qaFrames = [
  ["hook", "enter", 12], ["hook", "middle", 90], ["hook", "exit", 168],
  ["terminal", "enter", 192], ["terminal", "middle", 390], ["terminal", "exit", 588],
  ["overload", "enter", 612], ["overload", "middle", 810], ["overload", "exit", 1008],
  ["init", "enter", 1032], ["init", "middle", 1200], ["init", "exit", 1368],
  ["search", "enter", 1392], ["search", "middle", 1620], ["search", "exit", 1848],
  ["clear", "enter", 1872], ["clear", "middle", 2040], ["clear", "exit", 2208],
  ["starting-five", "enter", 2232], ["starting-five", "middle", 2400], ["starting-five", "exit", 2568],
  ["tool-call", "enter", 2592], ["tool-call", "middle", 2700], ["tool-call", "exit", 2808],
  ["sixth-man", "enter", 2832], ["sixth-man", "middle", 2910], ["sixth-man", "exit", 2988],
  ["coach-league", "enter", 3012], ["coach-league", "middle", 3120], ["coach-league", "exit", 3228],
  ["final", "enter", 3252], ["final", "middle", 3330], ["final", "exit", 3408],
];

const outputRoot = process.env.ROSTER_FILM_OUTPUT ?? "out";
const outputDirectory = resolve(outputRoot, "qa");
mkdirSync(outputDirectory, { recursive: true });

for (const [scene, phase, frame] of qaFrames) {
  const output = resolve(outputDirectory, `${String(frame).padStart(4, "0")}-${scene}-${phase}.png`);
  const result = spawnSync(
    "pnpm",
    [
      "exec", "remotion", "still", "src/index.ts", "RosterLaunchMaster", output,
      `--frame=${frame}`, "--scale=0.25", "--image-format=png", "--overwrite", "--log=error",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const sheet = spawnSync(
  "pnpm",
  [
    "exec", "remotion", "still", "src/index.ts", "RosterLaunchQASheet", resolve(outputRoot, "roster-launch-redesign-qa-sheet.png"),
    "--image-format=png", "--overwrite", "--log=error",
  ],
  { stdio: "inherit" },
);
if (sheet.status !== 0) process.exit(sheet.status ?? 1);

console.log(`Rendered ${qaFrames.length} QA stills and the full QA sheet under ${outputRoot}`);
