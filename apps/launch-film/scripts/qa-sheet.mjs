/**
 * Build the QA sheet: safe-area overlays, the claim ledger, and the measured
 * master specification recorded by `pnpm probe`.
 */
import fs from "node:fs";
import path from "node:path";
import { renderStill } from "@remotion/renderer";
import { composition, OUT } from "./lib/render.mjs";

fs.mkdirSync(OUT, { recursive: true });
const { url, comp } = await composition("QaSheet");
await renderStill({
  composition: comp,
  serveUrl: url,
  output: path.join(OUT, "roster-launch-premium-qa-sheet.png"),
  frame: 0,
  imageFormat: "png",
  overwrite: true,
  chromiumOptions: { gl: "angle" },
  logLevel: "error",
});
process.stdout.write("sheet  → out/premium-v1/roster-launch-premium-qa-sheet.png\n");
