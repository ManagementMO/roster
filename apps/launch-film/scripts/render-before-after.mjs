import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const source = resolve("out/roster-launch-poster.png");
const publicDirectory = resolve("public/reference");
const temporaryReference = resolve(publicDirectory, "current-poster.png");
const output = resolve("out/redesign/roster-launch-before-after.png");

mkdirSync(publicDirectory, { recursive: true });
mkdirSync(resolve("out/redesign"), { recursive: true });
copyFileSync(source, temporaryReference);

const result = spawnSync(
  "pnpm",
  ["exec", "remotion", "still", "src/index.ts", "RosterLaunchBeforeAfter", output, "--image-format=png", "--overwrite"],
  { stdio: "inherit" },
);

rmSync(temporaryReference, { force: true });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Rendered before/after comparison to ${output}`);
