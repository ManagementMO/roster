import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
assert(root);
const runtime = path.join(root, "home", ".roster", "runtime");
const manifest = JSON.parse(fs.readFileSync(path.join(runtime, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(runtime, "package-lock.json"), "utf8"));
const source = "https://codeload.github.com/cthackers/adm-zip/tar.gz/7d90dea2bfd35bc4761d6c8cf822f26b59aeef77";
const integrity = "sha512-Z+8z9iu7sdwHszy4COKslntwKRizG/eYVq9v4tIEnDpplTY4ML8cWyyvTjgvVKvaHHAfD43OATnebE9qhZ+fOw==";
assert.equal(manifest.overrides?.["adm-zip"], source);
const zips = Object.entries(lock.packages).filter(([name]) => name.endsWith("/adm-zip"));
assert.equal(zips.length, 1);
assert.equal(zips[0][1].resolved, source);
assert.equal(zips[0][1].integrity, integrity);
const utils = fs.readFileSync(path.join(runtime, zips[0][0], "util", "utils.js"));
assert.equal(crypto.createHash("sha256").update(utils).digest("hex"), "569a200eb69d5d222e444fd03d9b84d258161df30e43f957eb7dc09b7477b461");
const require = createRequire(path.join(runtime, "package.json"));
const { pipeline, env } = await import(pathToFileURL(require.resolve("@huggingface/transformers")).href);
env.cacheDir = path.join(root, "models");
env.allowLocalModels = false;
const started = Date.now();
const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
try {
  const vectors = (await pipe(["write a file to disk", "save text into a document", "the weather is sunny today"], { pooling: "mean", normalize: true })).tolist();
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const result = { dimensions: vectors[0].length, norm: Math.sqrt(dot(vectors[0], vectors[0])), near: dot(vectors[0], vectors[1]), far: dot(vectors[0], vectors[2]), durationMs: Date.now() - started };
  assert.equal(result.dimensions, 384);
  assert(Math.abs(result.norm - 1) < 0.001);
  assert(result.near > result.far);
  console.log(JSON.stringify(result));
} finally {
  await pipe.dispose?.();
}
