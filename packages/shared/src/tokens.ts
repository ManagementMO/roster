/**
 * Local token estimate: ~4 characters per token for English/JSON.
 *
 * An ESTIMATE, and every consumer must label it as such — the receipt's integrity
 * law forbids presenting it as an exact count. It carried a "±15%" label until
 * this repo's OWN harness refuted it: the real error spans −37%…+27%, depending
 * on tokenizer family (WordPiece vs a legacy BPE) and payload type (compact JSON
 * vs prose) — docs/lab/notes-token-economics.md, conclusion 4. A number our own
 * lab has already disproved is a fabricated number, and that is the one thing
 * this project's first law forbids outright. The honest bound is the measured
 * one (R5-11).
 */
export function estimateTokens(text: string): number {
  return estimateTokensFromChars(text.length);
}

/** Same estimate from a known character count — avoids allocating a huge string just to divide by 4. */
export function estimateTokensFromChars(chars: number): number {
  return chars <= 0 ? 0 : Math.ceil(chars / 4);
}
