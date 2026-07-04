/**
 * Part D — input torture: "", 1 char, 100KB text, emoji-only, RTL, \u0000,
 * empty batch [], 500 identical texts in one call. Every case → valid vector
 * (dims/norm recorded, NaN/Inf scanned) or a clean error. The 100KB case runs
 * last with a watchdog so a hang is reported instead of wedging the part.
 */
import { loadCoach, scanVec, savePart, audit, vecAudit } from "./exp-embed-torture-lib.mjs";

const { TransformersEmbeddings, MINILM_MODEL } = await loadCoach();
const out = { part: "d-inputs", model: MINILM_MODEL, startedAt: new Date().toISOString(), cases: [] };
const unhandled = [];
process.on("unhandledRejection", (r) => unhandled.push(String(r)));

const provider = new TransformersEmbeddings(MINILM_MODEL);
audit(await provider.embed(["roster warmup"]));

async function tortureCase(name, texts, { timeoutMs = 120000 } = {}) {
  const t0 = performance.now();
  let timer;
  const watchdog = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`WATCHDOG: no result in ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    const vecs = await Promise.race([provider.embed(texts), watchdog]);
    clearTimeout(timer);
    audit(vecs);
    const scans = vecs.map(scanVec);
    const rec = {
      name,
      inputCount: texts.length,
      ok: true,
      ms: +(performance.now() - t0).toFixed(1),
      outVectors: vecs.length,
      dims: vecs[0]?.length ?? null,
      nanComponents: scans.reduce((a, s) => a + s.nan, 0),
      infComponents: scans.reduce((a, s) => a + s.inf, 0),
      normMin: scans.length ? +Math.min(...scans.map((s) => s.norm)).toFixed(6) : null,
      normMax: scans.length ? +Math.max(...scans.map((s) => s.norm)).toFixed(6) : null,
    };
    out.cases.push(rec);
    console.log(JSON.stringify(rec));
    return rec;
  } catch (e) {
    clearTimeout(timer);
    const rec = { name, inputCount: texts.length, ok: false, ms: +(performance.now() - t0).toFixed(1), error: String(e) };
    out.cases.push(rec);
    console.log(JSON.stringify(rec));
    return rec;
  }
}

await tortureCase("empty-string", [""]);
await tortureCase("one-char", ["a"]);
await tortureCase("emoji-only", ["😀🎉🚀💯🔥🧠🤖✨🌍🎯"]);
await tortureCase("rtl-arabic-hebrew", ["مرحبا بالعالم اقرأ الملف من نظام الملفات שלום עולם קרא קובץ"]);
await tortureCase("nul-byte-inside", ["hello\u0000world read a file\u0000from disk"]);
await tortureCase("empty-batch", []);
await tortureCase("identical-500-one-call", Array.from({ length: 500 }, () => "read the file from disk"));

// identical-500 consistency: all 500 rows should be identical to each other.
{
  const vecs = await provider.embed(Array.from({ length: 500 }, () => "ping"));
  audit(vecs);
  const first = vecs[0];
  let allBitwise = true;
  const b0 = new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  for (const v of vecs) {
    const bv = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    for (let i = 0; i < b0.length; i++) if (bv[i] !== b0[i]) { allBitwise = false; break; }
    if (!allBitwise) break;
  }
  out.identical500RowsBitwiseSame = allBitwise;
  console.log(JSON.stringify({ identical500RowsBitwiseSame: allBitwise }));
}

// 100KB last (watchdog 180s) — MiniLM context is 512 wordpieces; does the
// pipeline truncate or choke?
const big = "read the file and summarize its contents please ".repeat(2100).slice(0, 100_000);
out.bigLen = big.length;
await tortureCase("100KB-text", [big], { timeoutMs: 180000 });

await provider.dispose();
out.unhandledRejections = unhandled;
out.vecAudit = { ...vecAudit };
savePart("d", out);
console.log("done part d");
