/**
 * The README loop.
 *
 * Rendered programmatically rather than through `remotion render --codec=gif`,
 * because `remotion.config.ts` sets a global CRF for the H.264 master and the
 * CLI rejects `--crf` on the gif codec ("The gif codec does not support the
 * --crf option"). Going through `renderMedia` lets this one output opt out of
 * the film's encode settings without weakening them for the master.
 *
 * The window is the Starting Five lock — the film's best three seconds.
 */
import fs from "node:fs";
import path from "node:path";
import { renderMedia } from "@remotion/renderer";
import { scene } from "../src/motion/timing.ts";
import { composition, OUT } from "./lib/render.mjs";

const five = scene("startingFive");
const from = five.from + 20;
const to = five.from + five.duration - 20;

fs.mkdirSync(OUT, { recursive: true });
const { url, comp } = await composition("LaunchFilm");

const output = path.join(OUT, "roster-launch-premium-readme.gif");
await renderMedia({
  composition: { ...comp, durationInFrames: comp.durationInFrames },
  serveUrl: url,
  codec: "gif",
  outputLocation: output,
  frameRange: [from, to],
  everyNthFrame: 3,
  numberOfGifLoops: null,
  scale: 0.34,
  overwrite: true,
  chromiumOptions: { gl: "angle" },
  logLevel: "error",
});

const size = fs.statSync(output).size;
process.stdout.write(
  `gif    ${path.relative(process.cwd(), output)}  f${from}–${to} @ every 3rd frame  ${(size / 1024 / 1024).toFixed(2)} MB\n`,
);
