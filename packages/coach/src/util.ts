import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Key-sorted stringify so semantically-equal args hash identically. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Privacy boundary: raw args never persist anywhere — only this hash does,
 * and only to power the retry-with-modified-args soft-fail signal.
 */
export function hashArgs(args: unknown): string {
  return sha256Hex(stableStringify(args ?? null));
}

export function hashNeed(need: string): string {
  return sha256Hex(need.trim().toLowerCase());
}

export function vecToBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function blobToVec(blob: Buffer, dims: number): Float32Array {
  const copy = Buffer.from(blob); // ensure alignment
  return new Float32Array(copy.buffer, copy.byteOffset, dims);
}
