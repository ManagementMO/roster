/**
 * Part F — cross-process determinism: embed the same 5 corpus texts
 * single-shot and as one batch-of-5; print sha256 of the raw Float32 bytes.
 * Run twice (two processes); identical hashes ⇒ restart-stable vectors.
 */
import crypto from "node:crypto";
import { loadCoach, serveText, audit } from "./exp-embed-torture-lib.mjs";
import { TOOLS } from "./corpus.mjs";

const { TransformersEmbeddings, MINILM_MODEL } = await loadCoach();
const provider = new TransformersEmbeddings(MINILM_MODEL);
const texts = TOOLS.slice(0, 5).map(serveText);

const sha = (v) => crypto.createHash("sha256").update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)).digest("hex").slice(0, 16);

const singles = [];
for (const t of texts) singles.push(audit(await provider.embed([t]))[0]);
const batch = audit(await provider.embed(texts));
console.log(JSON.stringify({ single: singles.map(sha), batch5: batch.map(sha) }));
await provider.dispose();
