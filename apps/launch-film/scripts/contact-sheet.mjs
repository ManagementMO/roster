/**
 * Build the contact sheet.
 *
 * Renders entry/midpoint/exit for all eleven scenes, copies them into
 * `public/qa/`, writes the manifest the sheet composition reads, then renders
 * the sheet itself. One bundle, no external image tooling.
 */
import fs from "node:fs";
import path from "node:path";
import { renderStill } from "@remotion/renderer";
import { SCENES, sampleFrames } from "../src/motion/timing.ts";
import { composition, OUT, ROOT, stills } from "./lib/render.mjs";

const QA_PUBLIC = path.join(ROOT, "public", "qa");
const WORK = path.join(ROOT, "out", "qa-frames");
fs.mkdirSync(QA_PUBLIC, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const wanted = SCENES.flatMap((s) => {
  const f = sampleFrames(s.id);
  return [
    { scene: s.id, label: "entry", frame: f.entry },
    { scene: s.id, label: "mid", frame: f.mid },
    { scene: s.id, label: "exit", frame: f.exit },
  ];
});

process.stdout.write(`sheet  rendering ${wanted.length} frames…\n`);
await stills({ frames: wanted.map((w) => w.frame), dir: WORK, prefix: "qa", scale: 0.5 });

const shots = wanted.map((w) => {
  const file = `scene-${w.scene}-${w.label}.png`;
  fs.copyFileSync(path.join(WORK, `qa-${String(w.frame).padStart(4, "0")}.png`), path.join(QA_PUBLIC, file));
  return { ...w, file };
});

/** The rejected-direction reference frames, rendered from their own compositions. */
const REJECTED = [
  { id: "Rejected-overload", scene: "overload", label: "entry" },
  { id: "Rejected-startingFive", scene: "startingFive", label: "mid" },
  { id: "Rejected-reveal", scene: "reveal", label: "exit" },
];

const before = [];
for (const r of REJECTED) {
  const { url, comp } = await composition(r.id);
  const file = `rejected-${r.scene}.png`;
  await renderStill({
    composition: comp,
    serveUrl: url,
    output: path.join(QA_PUBLIC, file),
    frame: 0,
    imageFormat: "png",
    scale: 0.5,
    overwrite: true,
    chromiumOptions: { gl: "angle" },
    logLevel: "error",
  });
  const match = shots.find((s) => s.scene === r.scene && s.label === r.label);
  before.push({ file, scene: r.scene, label: r.label, frame: match?.frame ?? 0 });
}

// Carry any master metadata a prior `pnpm probe` run recorded.
const manifestPath = path.join(ROOT, "src", "qa", "manifest.json");
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
fs.writeFileSync(manifestPath, `${JSON.stringify({ shots, before, meta: previous.meta ?? {} }, null, 2)}\n`);
process.stdout.write(`sheet  manifest → src/qa/manifest.json (${shots.length} shots, ${before.length} references)\n`);

// The bundle must be rebuilt so the sheet sees the new manifest and images.
const fresh = await composition("ContactSheet", true);
await renderStill({
  composition: fresh.comp,
  serveUrl: fresh.url,
  output: path.join(OUT, "roster-launch-premium-contact-sheet.png"),
  frame: 0,
  imageFormat: "png",
  overwrite: true,
  chromiumOptions: { gl: "angle" },
  logLevel: "error",
});
process.stdout.write("sheet  → out/premium-v1/roster-launch-premium-contact-sheet.png\n");
