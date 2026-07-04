/** Assemble docs/lab/results-embed-torture.json from tmp part files. */
import fs from "node:fs";
import path from "node:path";
import { repo, tmpDir } from "./exp-embed-torture-lib.mjs";

const read = (f) => JSON.parse(fs.readFileSync(path.join(tmpDir, f), "utf8"));
const out = {
  charter: "embed-torture",
  model: "Xenova/all-MiniLM-L6-v2 (real ONNX q8 via @huggingface/transformers 4.2.0)",
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  generatedAt: new Date().toISOString(),
  a_queue: read("part-a.json"),
  b_dispose: read("part-b.json"),
  c_rewarm5: read("part-c.json"),
  c2_cycle12: read("part-c2-cycle.json"),
  c2_hold12: read("part-c2-hold.json"),
  d_inputs: read("part-d.json"),
  e_batchequiv: read("part-e.json"),
  f_crossProcess: {
    run1: JSON.parse(fs.readFileSync(path.join(tmpDir, "xproc-run1.json"), "utf8")),
    run2: JSON.parse(fs.readFileSync(path.join(tmpDir, "xproc-run2.json"), "utf8")),
    identical: fs.readFileSync(path.join(tmpDir, "xproc-run1.json"), "utf8") === fs.readFileSync(path.join(tmpDir, "xproc-run2.json"), "utf8"),
  },
};
const dest = path.join(repo, "docs/lab/results-embed-torture.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`wrote ${dest}`);
const totalVecs = ["a_queue", "b_dispose", "c_rewarm5", "c2_cycle12", "c2_hold12", "d_inputs", "e_batchequiv"]
  .reduce((acc, k) => {
    const va = out[k].vecAudit;
    return { vectors: acc.vectors + va.vectors, nan: acc.nan + va.nan, inf: acc.inf + va.inf, zeroNorm: acc.zeroNorm + va.zeroNorm };
  }, { vectors: 0, nan: 0, inf: 0, zeroNorm: 0 });
console.log("charter-wide vector audit:", JSON.stringify(totalVecs));
