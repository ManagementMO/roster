/**
 * Shared helpers for the proxy-tax experiments (exp-proxy-tax-*.mjs).
 * Imports built packages exactly like docs/verification/dense-live.mjs.
 */
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Scratch dir for homes/DBs/partial results (merged into results-proxy-tax.json, then deleted).
export const scratchDir = path.join(repo, "docs/lab/tmp-proxy-tax");
const { mkdirSync } = await import("node:fs");
mkdirSync(scratchDir, { recursive: true });
const cliRequire = createRequire(path.join(repo, "packages/cli/package.json"));

export const coach = await import(cliRequire.resolve("@rosterhq/coach"));
export const routerPkg = await import(cliRequire.resolve("@rosterhq/router"));

const sdkRequire = createRequire(path.join(repo, "packages/router/package.json"));
export const { Client } = await import(sdkRequire.resolve("@modelcontextprotocol/sdk/client/index.js"));
export const { StdioClientTransport } = await import(
  sdkRequire.resolve("@modelcontextprotocol/sdk/client/stdio.js")
);
const coachRequire = createRequire(path.join(repo, "packages/coach/package.json"));
export const Database = coachRequire("better-sqlite3");

export const machine = {
  node: process.version,
  platform: `${os.platform()}/${os.arch()}`,
  cpu: os.cpus()[0]?.model ?? "unknown",
  cores: os.cpus().length,
  totalMemGiB: +(os.totalmem() / 2 ** 30).toFixed(1),
};

/** hrtime a synchronous fn call → microseconds. */
export function timeSyncUs(fn) {
  const t0 = process.hrtime.bigint();
  const out = fn();
  const dt = Number(process.hrtime.bigint() - t0) / 1000;
  return { us: dt, out };
}

/** hrtime an async fn call → microseconds. */
export async function timeAsyncUs(fn) {
  const t0 = process.hrtime.bigint();
  const out = await fn();
  const dt = Number(process.hrtime.bigint() - t0) / 1000;
  return { us: dt, out };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

/** Stats over an array of microsecond samples → milliseconds. */
export function statsMs(usSamples) {
  const s = [...usSamples].sort((a, b) => a - b);
  const ms = (us) => +(us / 1000).toFixed(3);
  const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1);
  return {
    n: s.length,
    p50_ms: ms(pct(s, 50)),
    p95_ms: ms(pct(s, 95)),
    mean_ms: ms(mean),
    min_ms: ms(s[0] ?? 0),
    max_ms: ms(s[s.length - 1] ?? 0),
  };
}

/**
 * Extend the shared corpus to `n` tools by mirroring entries under suffixed
 * sources (real-shaped cards; descriptions get a distinct mirror tag so FTS
 * and embeddings see distinct documents, as they would in a real big roster).
 */
export function extendCorpus(tools, n) {
  const out = tools.slice(0, Math.min(n, tools.length)).map((t) => ({ ...t }));
  let gen = 2;
  while (out.length < n) {
    for (const t of tools) {
      if (out.length >= n) break;
      out.push({
        ...t,
        id: `${t.source}${gen}__${t.name}`,
        source: `${t.source}${gen}`,
        description: `${t.description} (mirror ${gen})`,
      });
    }
    gen += 1;
  }
  return out;
}

export const toolText = (t) => `${t.name}\n${t.description}`;

/** Embed texts in batches with a real provider; returns Float32Array[]. */
export async function embedAll(provider, texts, kind, batch = 16) {
  const out = [];
  for (let i = 0; i < texts.length; i += batch) {
    const vecs = await provider.embed(texts.slice(i, i + batch), kind);
    out.push(...vecs);
  }
  return out;
}
