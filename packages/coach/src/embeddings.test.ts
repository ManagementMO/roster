import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEMMA_MODEL, MINILM_MODEL, setDenseRuntimeDir, TransformersEmbeddings } from "./embeddings.js";

vi.mock("@huggingface/transformers", () => { throw new Error("native binding unavailable"); });

let root: string;
const providers: TransformersEmbeddings[] = [];
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "roster-wasm-")));
  const pkg = path.join(root, "node_modules", "@huggingface", "transformers");
  const dist = path.join(pkg, "dist");
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@huggingface/transformers", version: "4.2.0", main: "dist/transformers.node.cjs" }));
  fs.writeFileSync(path.join(dist, "transformers.node.cjs"), 'throw Object.assign(new Error("native unavailable"), { code: "ERR_DLOPEN_FAILED" });');
  fs.writeFileSync(path.join(dist, "transformers.web.js"), `
    exports.env = {};
    exports.pipeline = async (task, model, options) => {
      if (task !== "feature-extraction" || options.dtype !== "q8" || options.device !== "auto") throw new Error("wrong pipeline options");
      const key = "https://models.invalid/" + model + "/model.onnx";
      const cached = await exports.env.customCache.match(key);
      if (!cached) {
        if (process.env.ROSTER_FIXTURE_OFFLINE === "1") throw new Error("model cache missing offline");
        await exports.env.customCache.put(key, new Response("public model artifact"));
      }
      let active = false;
      const pipe = async (texts, opts) => {
        if (active) throw new Error("concurrent inference");
        if (opts.pooling !== "mean" || !opts.normalize) throw new Error("wrong pooling options");
        active = true;
        await new Promise((resolve) => setTimeout(resolve, 10));
        active = false;
        if (model.includes("embeddinggemma") && !texts.every((text) => text.startsWith("task: search result | query: ") || text.startsWith("title: none | text: "))) throw new Error("missing task prefix");
        return { tolist: () => texts.map(() => [0.6, 0.8, ...Array(model.includes("embeddinggemma") ? 766 : 382).fill(0)]) };
      };
      pipe.dispose = async () => require("node:fs").appendFileSync(${JSON.stringify(path.join(root, "disposed"))}, "disposed\\n");
      console.log("worker stdout must stay out of MCP");
      return pipe;
    };
  `);
  const ort = path.join(pkg, "node_modules", "onnxruntime-web");
  fs.mkdirSync(path.join(ort, "dist"), { recursive: true });
  fs.writeFileSync(path.join(ort, "package.json"), JSON.stringify({ main: "dist/ort.node.min.js" }));
  fs.writeFileSync(path.join(ort, "dist", "ort.node.min.js"), 'exports.env = { wasm: {} }; exports.Tensor = class { constructor(type, data, dims) { this.data = data; this.dims = dims; } }; exports.InferenceSession = { async create() { return { async run(feeds) { return { result: feeds.value }; }, async release() {} }; } };');
  fs.writeFileSync(path.join(ort, "dist", "ort-wasm-simd-threaded.mjs"), "export default {};");
  fs.writeFileSync(path.join(ort, "dist", "ort-wasm-simd-threaded.wasm"), "fixture");
  setDenseRuntimeDir(path.join(root, "node_modules"));
});
afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.dispose()));
  setDenseRuntimeDir(null);
  delete process.env.ROSTER_FIXTURE_OFFLINE;
  fs.rmSync(root, { recursive: true, force: true });
});
const providerFor = (model = MINILM_MODEL) => { const provider = new TransformersEmbeddings(model); providers.push(provider); return provider; };

describe("portable dense fallback", () => {
  it("embeds with WASM when native import fails, serializes calls, and disposes the actual pipeline", async () => {
    expect(await TransformersEmbeddings.isAvailable()).toBe(true);
    const provider = providerFor();
    const [a, b] = await Promise.all([provider.embed(["first"]), provider.embed(["second"])]);
    expect(a[0]).toHaveLength(384);
    expect(b[0]).toEqual(a[0]);
    await provider.dispose();
    expect(fs.readFileSync(path.join(root, "disposed"), "utf8")).toBe("disposed\n");
    await expect(provider.embed(["after disposal"])).rejects.toThrow("disposed");
  });

  it("preserves Gemma prefixes and 256-dimensional Matryoshka normalization", async () => {
    const provider = providerFor(GEMMA_MODEL);
    const [query] = await provider.embed(["find a tool"], "query");
    const [document] = await provider.embed(["read text files"], "document");
    expect(query).toHaveLength(256);
    expect(document).toHaveLength(256);
    expect(Math.hypot(...query!)).toBeCloseTo(1);
  });

  it("refuses a symlinked cache directory without writing outside its private root", async () => {
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "sentinel"), "unchanged");
    fs.symlinkSync(outside, path.join(root, "cache"), process.platform === "win32" ? "junction" : "dir");
    await expect(providerFor().embed(["private need"])).rejects.toThrow();
    expect(fs.readdirSync(outside)).toEqual(["sentinel"]);
    expect(fs.readFileSync(path.join(outside, "sentinel"), "utf8")).toBe("unchanged");
  });

  it("refuses a symlinked cached artifact instead of following it", async () => {
    const first = providerFor();
    await first.embed(["private need"]);
    await first.dispose();
    const directory = path.join(root, "cache", "wasm");
    const file = path.join(directory, fs.readdirSync(directory)[0]!);
    const outside = path.join(root, "outside-model");
    fs.writeFileSync(outside, "outside stays unchanged");
    fs.unlinkSync(file);
    fs.symlinkSync(outside, file, "file");
    await expect(providerFor().embed(["another private need"])).rejects.toThrow();
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(outside, "utf8")).toBe("outside stays unchanged");
  });

  it("persists only private model artifacts and reloads them in a fresh worker offline", async () => {
    const first = providerFor();
    await first.embed(["private-need-canary-not-a-model"]);
    await first.dispose();
    process.env.ROSTER_FIXTURE_OFFLINE = "1";
    const second = providerFor();
    await expect(second.embed(["different private need"])).resolves.toHaveLength(1);
    const cache = path.join(root, "cache", "wasm");
    const files = fs.readdirSync(cache);
    expect(files).toHaveLength(1);
    for (const file of files) {
      const full = path.join(cache, file);
      expect(fs.readFileSync(full, "utf8")).toBe("public model artifact");
      if (process.platform !== "win32") expect(fs.statSync(full).mode & 0o077).toBe(0);
    }
  });
});
