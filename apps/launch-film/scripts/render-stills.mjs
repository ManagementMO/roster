/**
 * Render entry / midpoint / exit stills for every scene.
 *
 * This is the film's QA loop: `pnpm stills`, look at all 33 images, fix what is
 * wrong, repeat. Frames come from `motion/timing.ts` so the sample points move
 * automatically when a scene is retimed.
 *
 * Usage:
 *   node scripts/render-stills.mjs                 all scenes
 *   node scripts/render-stills.mjs search clearing just those
 *   node scripts/render-stills.mjs --frames 120,2400,3420
 */
import fs from "node:fs";
import path from "node:path";
import { SCENES, sampleFrames } from "../src/motion/timing.ts";
import { STILLS, stills } from "./lib/render.mjs";

const args = process.argv.slice(2);
const frameFlag = args.indexOf("--frames");
const scaleFlag = args.indexOf("--scale");
const scale = scaleFlag >= 0 ? Number(args[scaleFlag + 1]) : 1;

fs.mkdirSync(STILLS, { recursive: true });

let frames;
let prefix = "scene";

if (frameFlag >= 0) {
  frames = String(args[frameFlag + 1] ?? "")
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n));
  prefix = "frame";
} else {
  const wanted = args.filter((a) => !a.startsWith("--") && !/^[\d.,]+$/.test(a));
  const list = wanted.length > 0 ? SCENES.filter((s) => wanted.includes(s.id)) : SCENES;
  frames = list.flatMap((s) => {
    const f = sampleFrames(s.id);
    return [f.entry, f.mid, f.exit];
  });
}

if (frames.length === 0) {
  process.stderr.write("nothing to render\n");
  process.exit(1);
}

const started = Date.now();
const out = await stills({ frames, dir: STILLS, prefix, scale });
for (const f of out) process.stdout.write(`still  ${path.relative(process.cwd(), f)}\n`);
process.stdout.write(`stills ${out.length} frames in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
