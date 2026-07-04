/**
 * Local token estimate: ~4 characters per token for English/JSON.
 * This is an ESTIMATE (±15%) and every consumer must label it as such —
 * the receipt's integrity law forbids presenting it as an exact count.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateTokensForJson(value: unknown): number {
  return estimateTokens(JSON.stringify(value) ?? "");
}
