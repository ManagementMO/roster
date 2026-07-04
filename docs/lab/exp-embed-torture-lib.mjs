/**
 * Shared helpers for the embed-torture charter (real MiniLM via
 * TransformersEmbeddings — NO mocks). Each part script writes
 * docs/lab/tmp-embed-torture/part-<x>.json; the merge script assembles
 * docs/lab/results-embed-torture.json.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const tmpDir = path.join(repo, "docs/lab/tmp-embed-torture");

export async function loadCoach() {
  return import(
    createRequire(path.join(repo, "packages/cli/package.json")).resolve("@rosterhq/coach")
  );
}

/** Serve-path text formula (packages/cli/src/serve.ts:116). */
export const serveText = (e) => `${e.name}\n${e.description}\n${e.body ?? ""}`.slice(0, 2000);

/** Scan a Float32Array for NaN/Inf; returns {nan, inf, norm}. */
export function scanVec(v) {
  let nan = 0, inf = 0, norm = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (Number.isNaN(x)) nan++;
    else if (!Number.isFinite(x)) inf++;
    else norm += x * x;
  }
  return { nan, inf, norm: Math.sqrt(norm) };
}

/** Bitwise (byte-level) equality of two Float32Arrays. */
export function bitwiseEqual(a, b) {
  if (a.length !== b.length) return false;
  const ba = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const bb = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < ba.length; i++) if (ba[i] !== bb[i]) return false;
  return true;
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

export function maxAbsDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

export function savePart(name, data) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const p = path.join(tmpDir, `part-${name}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  console.log(`saved ${p}`);
}

export const rssMb = () => +(process.memoryUsage().rss / 1024 / 1024).toFixed(1);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Global NaN/Inf tally for the whole part — every vector must pass through. */
export const vecAudit = { vectors: 0, nan: 0, inf: 0, zeroNorm: 0 };
export function audit(vecs) {
  for (const v of vecs) {
    const s = scanVec(v);
    vecAudit.vectors++;
    vecAudit.nan += s.nan;
    vecAudit.inf += s.inf;
    if (s.norm === 0) vecAudit.zeroNorm++;
  }
  return vecs;
}
