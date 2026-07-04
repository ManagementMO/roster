/**
 * Part B — dispose() during in-flight embeds.
 * Warm variant: 20 embeds launched, dispose fired when the 5th settles →
 * every in-flight call must settle cleanly (resolve or clean rejection),
 * zero unhandledRejection events, and post-dispose embed rejects clearly.
 * Cold variant: dispose immediately after launching 5 embeds on a never-
 * loaded provider. Plus double-dispose idempotence.
 */
import { loadCoach, serveText, cosine, savePart, audit, vecAudit, sleep } from "./exp-embed-torture-lib.mjs";
import { TOOLS } from "./corpus.mjs";

const { TransformersEmbeddings, MINILM_MODEL } = await loadCoach();
const out = { part: "b-dispose", model: MINILM_MODEL, startedAt: new Date().toISOString() };
const unhandled = [];
process.on("unhandledRejection", (r) => unhandled.push(String(r)));
const uncaught = [];
process.on("uncaughtException", (e) => uncaught.push(String(e)));

const texts = TOOLS.slice(0, 20).map(serveText);

// ---- Warm variant -----------------------------------------------------------
{
  const provider = new TransformersEmbeddings(MINILM_MODEL);
  const ref = audit(await provider.embed([texts[0]]))[0]; // warm + reference

  let settled = 0;
  let disposeStartedAtSettleCount = -1;
  let disposePromise = null;
  const promises = texts.map((t) =>
    provider.embed([t]).then(
      (v) => {
        settled++;
        if (settled === 5 && !disposePromise) {
          disposeStartedAtSettleCount = settled;
          disposePromise = provider.dispose(); // mid-stream, NOT awaited
        }
        return { status: "fulfilled", vec: v[0] };
      },
      (e) => {
        settled++;
        return { status: "rejected", reason: String(e) };
      },
    ),
  );
  const results = await Promise.all(promises);
  await disposePromise;

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  fulfilled.forEach((r) => audit([r.vec]));
  // Validity of vectors produced around teardown: text[0]'s concurrent copy
  // must equal the pre-launch reference.
  const idx0 = results[0];
  out.warm = {
    launched: texts.length,
    disposeFiredAfterNSettled: disposeStartedAtSettleCount,
    fulfilled: fulfilled.length,
    rejected: rejected.length,
    rejectionReasons: [...new Set(rejected.map((r) => r.reason))],
    text0CosVsPreDisposeRef: idx0.status === "fulfilled" ? +cosine(idx0.vec, ref).toFixed(6) : null,
  };

  // Post-dispose embed must reject with a clear latched error.
  try {
    await provider.embed(["after dispose"]);
    out.postDispose = { rejected: false };
  } catch (e) {
    out.postDispose = { rejected: true, message: String(e) };
  }

  // Double dispose must be a clean no-op.
  try {
    await provider.dispose();
    out.doubleDispose = { ok: true };
  } catch (e) {
    out.doubleDispose = { ok: false, message: String(e) };
  }
}

// ---- Cold variant (pipeline never loaded; dispose fired synchronously) ------
{
  const provider = new TransformersEmbeddings(MINILM_MODEL);
  const ps = texts.slice(0, 5).map((t) =>
    provider.embed([t]).then(
      (v) => ({ status: "fulfilled", dims: v[0].length }),
      (e) => ({ status: "rejected", reason: String(e) }),
    ),
  );
  const dp = provider.dispose(); // same tick as the launches
  const results = await Promise.all(ps);
  await dp;
  out.cold = {
    launched: 5,
    fulfilled: results.filter((r) => r.status === "fulfilled").length,
    rejected: results.filter((r) => r.status === "rejected").length,
    reasons: [...new Set(results.filter((r) => r.status === "rejected").map((r) => r.reason))],
  };
}

// Let any stray rejections surface before reporting.
await sleep(750);
out.unhandledRejections = unhandled;
out.uncaughtExceptions = uncaught;
out.vecAudit = { ...vecAudit };
savePart("b", out);
console.log(JSON.stringify(out, null, 2));
