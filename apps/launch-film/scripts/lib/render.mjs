/**
 * Shared render helpers.
 *
 * Bundling is the expensive part of a Remotion render, so every QA script in
 * this folder bundles ONCE and then pulls as many stills as it needs out of the
 * same serve URL. That is the difference between a 40-second still pass and a
 * six-minute one, and it is why the visual iteration loop on this film was
 * usable at all.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill } from "@remotion/renderer";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
export const OUT = path.join(ROOT, "out", "premium-v1");
export const STILLS = path.join(ROOT, "out", "stills");

let cached = null;

/**
 * Bundle the film once per process. `rebuild` forces a fresh bundle, which the
 * contact-sheet script needs after it writes new stills and a new manifest into
 * `public/` — otherwise the sheet renders against the previous run's images.
 */
export async function serveUrl(rebuild = false) {
  if (cached && !rebuild) return cached;
  cached = await bundle({
    entryPoint: path.join(ROOT, "src", "index.ts"),
    onProgress: () => undefined,
  });
  return cached;
}

/** Resolve a composition by id. */
export async function composition(id = "LaunchFilm", rebuild = false) {
  const url = await serveUrl(rebuild);
  const comps = await getCompositions(url);
  const found = comps.find((c) => c.id === id);
  if (!found) throw new Error(`composition "${id}" not found`);
  return { url, comp: found };
}

/**
 * Render a batch of frames from one composition. Returns the output paths in
 * the same order as the input frames.
 */
export async function stills({ id = "LaunchFilm", frames, dir, prefix, scale = 1 }) {
  const { url, comp } = await composition(id);
  const out = [];
  for (const frame of frames) {
    const file = path.join(dir, `${prefix}-${String(frame).padStart(4, "0")}.png`);
    await renderStill({
      composition: comp,
      serveUrl: url,
      output: file,
      frame,
      imageFormat: "png",
      scale,
      overwrite: true,
      chromiumOptions: { gl: "angle" },
      logLevel: "error",
    });
    out.push(file);
  }
  return out;
}
