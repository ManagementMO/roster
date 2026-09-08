export type TerminalEvent =
  | { readonly type: "type"; readonly at: number; readonly text: string; readonly speed?: number }
  | { readonly type: "output"; readonly at: number; readonly text: string }
  | { readonly type: "success"; readonly at: number; readonly text: string }
  | { readonly type: "warning"; readonly at: number; readonly text: string }
  | { readonly type: "clear"; readonly at: number };

export const LIST_SCRIPT: readonly TerminalEvent[] = [
  { type: "type", at: 28, text: "codex mcp list", speed: 3.1 },
  { type: "output", at: 112, text: "github          enabled" },
  { type: "output", at: 126, text: "filesystem      enabled" },
  { type: "output", at: 140, text: "postgres        enabled" },
  { type: "output", at: 153, text: "playwright      enabled" },
  { type: "output", at: 166, text: "linear          enabled" },
  { type: "output", at: 178, text: "slack           enabled" },
  { type: "output", at: 190, text: "notion          enabled" },
  { type: "output", at: 202, text: "sentry          enabled" },
  { type: "output", at: 214, text: "stripe          enabled" },
  { type: "warning", at: 252, text: "tool schemas compete for the same attention" },
] as const;

export const INIT_SCRIPT: readonly TerminalEvent[] = [
  { type: "type", at: 18, text: "roster init", speed: 3.2 },
  { type: "success", at: 88, text: "ROSTER · Day-0 receipt" },
  { type: "output", at: 112, text: "clients discovered     local" },
  { type: "output", at: 130, text: "servers imported       deduplicated" },
  { type: "output", at: 148, text: "skills                 trust scanned" },
  { type: "success", at: 180, text: "one stdio endpoint ready" },
] as const;
