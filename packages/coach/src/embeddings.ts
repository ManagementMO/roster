import os from "node:os";

/**
 * The retrieval ladder's dense rung. Everything here is OPTIONAL by design:
 * if @huggingface/transformers is missing or the model was never fetched,
 * Roster keeps serving from FTS5 — nothing ever blocks on this module.
 */
export type EmbedKind = "query" | "document";

export interface EmbeddingsProvider {
  readonly dims: number;
  readonly modelId: string;
  embed(texts: readonly string[], kind?: EmbedKind): Promise<Float32Array[]>;
  dispose(): Promise<void>;
}

export const GEMMA_MODEL = "onnx-community/embeddinggemma-300m-ONNX";
export const MINILM_MODEL = "Xenova/all-MiniLM-L6-v2";
export const MATRYOSHKA_DIMS = 256;
export const MINILM_NATIVE_DIMS = 384;

const EIGHT_GIB = 8 * 1024 * 1024 * 1024;
const IDLE_UNLOAD_MS = 10 * 60 * 1000;

/** RAM-based auto-select (owner-delegated rule, handoff §6.2). */
export function selectModelId(totalMemBytes = os.totalmem()): string {
  return totalMemBytes >= EIGHT_GIB ? GEMMA_MODEL : MINILM_MODEL;
}

/** Matryoshka truncation + renormalize. No-op when already ≤ target. */
export function truncateAndNormalize(vec: Float32Array, dims = MATRYOSHKA_DIMS): Float32Array {
  const sliced = vec.length > dims ? vec.slice(0, dims) : vec;
  let norm = 0;
  for (const x of sliced) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm === 0) return new Float32Array(sliced.length);
  const out = new Float32Array(sliced.length);
  for (let i = 0; i < sliced.length; i++) out[i] = (sliced[i] as number) / norm;
  return out;
}

/**
 * EmbeddingGemma is prompt-trained: its model card mandates task prefixes for
 * queries vs documents; embedding raw text on both sides measurably degrades
 * retrieval. MiniLM has no such convention.
 */
export function gemmaPrefix(kind: EmbedKind, text: string): string {
  return kind === "query" ? `task: search result | query: ${text}` : `title: none | text: ${text}`;
}

interface RawPipeline {
  (texts: string[], opts: { pooling: "mean"; normalize: boolean }): Promise<{ tolist(): number[][] }>;
  dispose?: () => Promise<void>;
}

/**
 * transformers.js v4 provider. Lazy: nothing loads until the first embed().
 * Serialized: transformers.js does not support concurrent sessions, so every
 * call goes through one promise chain. Idle: after 10 minutes the pipeline is
 * properly DISPOSED (ONNX native memory released — nulling the JS ref alone
 * left ~300MB waiting on GC). Disposed providers are latched: further embeds
 * reject instead of silently re-downloading.
 */
export class TransformersEmbeddings implements EmbeddingsProvider {
  /** Matryoshka truncation applies ONLY to models trained for it (Gemma). */
  readonly dims: number;
  private pipe: RawPipeline | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(readonly modelId = selectModelId()) {
    this.dims = modelId === GEMMA_MODEL ? MATRYOSHKA_DIMS : MINILM_NATIVE_DIMS;
  }

  static async isAvailable(): Promise<boolean> {
    try {
      await import("@huggingface/transformers");
      return true;
    } catch {
      return false;
    }
  }

  async embed(texts: readonly string[], kind: EmbedKind = "document"): Promise<Float32Array[]> {
    if (this.disposed) throw new Error("embeddings provider disposed");
    const isGemma = this.modelId === GEMMA_MODEL;
    const prepared = isGemma ? texts.map((t) => gemmaPrefix(kind, t)) : [...texts];
    const run = this.queue.then(async () => {
      const pipe = await this.loadPipeline();
      const output = await pipe(prepared, { pooling: "mean", normalize: true });
      this.touchIdleTimer();
      return output
        .tolist()
        .map((row) =>
          isGemma ? truncateAndNormalize(new Float32Array(row)) : new Float32Array(row),
        );
    });
    // Keep the chain alive even when a call rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    await this.unloadThroughQueue();
  }

  private async loadPipeline(): Promise<RawPipeline> {
    if (this.pipe) return this.pipe;
    if (this.disposed) throw new Error("embeddings provider disposed");
    const { pipeline } = await import("@huggingface/transformers");
    this.pipe = (await pipeline("feature-extraction", this.modelId, {
      dtype: "q8",
    })) as unknown as RawPipeline;
    this.touchIdleTimer();
    return this.pipe;
  }

  private touchIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.unloadThroughQueue();
    }, IDLE_UNLOAD_MS);
    this.idleTimer.unref?.();
  }

  /** Unload serialized behind in-flight embeds so a session is never freed mid-call. */
  private async unloadThroughQueue(): Promise<void> {
    const run = this.queue.then(async () => {
      const pipe = this.pipe;
      this.pipe = null;
      if (pipe?.dispose) {
        await pipe.dispose().catch(() => undefined);
      }
    });
    this.queue = run.catch(() => undefined);
    await run;
  }
}
