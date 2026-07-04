import os from "node:os";

/**
 * The retrieval ladder's dense rung. Everything here is OPTIONAL by design:
 * if @huggingface/transformers is missing or the model was never fetched,
 * Roster keeps serving from FTS5 — nothing ever blocks on this module.
 */
export interface EmbeddingsProvider {
  readonly dims: number;
  embed(texts: readonly string[]): Promise<Float32Array[]>;
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

type FeaturePipeline = (
  texts: string[],
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/**
 * transformers.js v4 provider. Lazy: nothing loads until the first embed().
 * Serialized: transformers.js does not support concurrent sessions, so every
 * call goes through one promise chain. Idle: the pipeline unloads after
 * 10 minutes so resident RAM stays near zero for light users.
 */
export class TransformersEmbeddings implements EmbeddingsProvider {
  /**
   * Matryoshka truncation applies ONLY to models trained for it (Gemma).
   * Slicing MiniLM's 384 dims to 256 scrambles its geometry — live-verified:
   * cosines collapsed to ~0 and rankings degraded (docs/verification/).
   */
  readonly dims: number;
  private pipe: FeaturePipeline | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(private readonly modelId = selectModelId()) {
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

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    const run = this.queue.then(async () => {
      const pipe = await this.loadPipeline();
      const output = await pipe([...texts], { pooling: "mean", normalize: true });
      this.touchIdleTimer();
      const truncate = this.modelId === GEMMA_MODEL;
      return output
        .tolist()
        .map((row) =>
          truncate ? truncateAndNormalize(new Float32Array(row)) : new Float32Array(row),
        );
    });
    // Keep the chain alive even when a call rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  async dispose(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.pipe = null;
  }

  private async loadPipeline(): Promise<FeaturePipeline> {
    if (this.pipe) return this.pipe;
    const { pipeline } = await import("@huggingface/transformers");
    this.pipe = (await pipeline("feature-extraction", this.modelId, {
      dtype: "q8",
    })) as unknown as FeaturePipeline;
    this.touchIdleTimer();
    return this.pipe;
  }

  private touchIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.pipe = null;
    }, IDLE_UNLOAD_MS);
    this.idleTimer.unref?.();
  }
}
