/**
 * Build the before/after sheet from whatever the last contact-sheet run put in
 * `public/qa/`. Run `pnpm contact-sheet` first — this script only lays out.
 */
import fs from "node:fs";
import path from "node:path";
import { renderStill } from "@remotion/renderer";
import { composition, OUT } from "./lib/render.mjs";

fs.mkdirSync(OUT, { recursive: true });
const { url, comp } = await composition("BeforeAfter");
await renderStill({
  composition: comp,
  serveUrl: url,
  output: path.join(OUT, "roster-launch-premium-before-after.png"),
  frame: 0,
  imageFormat: "png",
  overwrite: true,
  chromiumOptions: { gl: "angle" },
  logLevel: "error",
});
process.stdout.write("sheet  → out/premium-v1/roster-launch-premium-before-after.png\n");
