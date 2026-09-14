import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ownedEmbeddingRuntimeEntry, probeEmbeddingRuntime, probeEmbeddingRuntimeAsync } from "./embeddingRuntime.js";

let root: string;
let entry: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "roster-runtime-probe-")));
  const pkg = path.join(root, "node_modules", "@huggingface", "transformers");
  const ort = path.join(pkg, "node_modules", "onnxruntime-node");
  fs.mkdirSync(ort, { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@huggingface/transformers", main: "index.cjs" }));
  entry = path.join(pkg, "index.cjs");
  fs.writeFileSync(entry, 'exports.pipeline = () => { throw new Error("the readiness probe must not load model weights"); };');
  fs.writeFileSync(path.join(ort, "package.json"), JSON.stringify({ main: "index.cjs" }));
  fs.writeFileSync(path.join(ort, "index.cjs"), 'exports.Tensor = class { constructor(type, data) { this.data = data; } }; exports.InferenceSession = { async create() { return { async run(feeds) { return { result: feeds.value }; }, async release() {} }; } };');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("bounded embedding-runtime readiness", () => {
  it("executes a backend probe without calling the model pipeline or creating a cache", async () => {
    expect(probeEmbeddingRuntime([entry])).toEqual({ state: "ready", backend: "native" });
    expect(await probeEmbeddingRuntimeAsync([entry])).toEqual({ state: "ready", backend: "native" });
    expect(fs.readdirSync(root)).toEqual(["node_modules"]);
  });

  it("refuses a runtime whose inference result is incorrect", () => {
    const ort = path.join(path.dirname(entry), "node_modules", "onnxruntime-node", "index.cjs");
    fs.writeFileSync(ort, 'exports.Tensor = class {}; exports.InferenceSession = { async create() { return { async run() { return { result: { data: [0] } }; }, async release() {} }; } };');
    const status = probeEmbeddingRuntime([entry]);
    expect(status.state).toBe("unavailable");
    expect(status).toHaveProperty("detail", expect.stringContaining("INVALID_PROBE_RESULT"));
  });

  it("bounds a hung module import instead of reporting ready or hanging the CLI", async () => {
    fs.writeFileSync(entry, "while (true) {};");
    expect(probeEmbeddingRuntime([entry], 100)).toEqual({ state: "unavailable", detail: "runtime readiness probe timed out" });
    expect(await probeEmbeddingRuntimeAsync([entry], 100)).toEqual({ state: "unavailable", detail: "runtime readiness probe timed out" });
  });

  it("does not report an installed ancestor as an owned runtime", () => {
    const modules = path.join(root, "child", "node_modules");
    fs.mkdirSync(path.join(modules, "@huggingface", "transformers"), { recursive: true });
    fs.writeFileSync(path.join(modules, "@huggingface", "transformers", "package.json"), JSON.stringify({ main: "missing.cjs" }));
    expect(ownedEmbeddingRuntimeEntry(modules)).toBeNull();
  });

  it("rejects an invalid probe response instead of trusting partial stdout", () => {
    fs.writeFileSync(entry, 'console.log("not the probe protocol"); exports.pipeline = () => {};');
    expect(probeEmbeddingRuntime([entry])).toEqual({ state: "unavailable", detail: "runtime readiness probe returned an invalid response" });
  });
});
