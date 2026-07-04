/**
 * Local token estimate: ~4 characters per token for English/JSON.
 * This is an ESTIMATE (±15%) and every consumer must label it as such —
 * the receipt's integrity law forbids presenting it as an exact count.
 */
export function estimateTokens(text: string): number {
  return estimateTokensFromChars(text.length);
}

/** Same estimate from a known character count — avoids allocating a huge string just to divide by 4. */
export function estimateTokensFromChars(chars: number): number {
  return chars <= 0 ? 0 : Math.ceil(chars / 4);
}
