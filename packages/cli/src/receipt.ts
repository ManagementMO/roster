import fs from "node:fs";
import { estimateTokensFromChars } from "@rosterhq/shared";
import { openclawInjectionChars, type ParsedSkill } from "@rosterhq/playbook";
import type { Discovery } from "./clients.js";
import { receiptPath, rosterHome } from "./paths.js";
import { serverIdentity } from "./rosterfile.js";

/**
 * The Day-0 receipt — numbers only, truthful by client (kill-risk K5 fix):
 * Claude Code defers schemas natively, so we NEVER claim its schemas are
 * "loaded"; token weights elsewhere are measured at first serve, not guessed.
 * Every count below is real; every estimate is labeled.
 */
export interface Receipt {
  generatedAt: string;
  clients: Array<{
    id: string;
    displayName: string;
    configPath: string;
    serverCount: number;
    note: string;
  }>;
  uniqueServers: number;
  skills: {
    count: number;
    trustReview: number;
    openclaw: { chars: number; estTokens: number } | null;
  };
  methodology: string;
}

export function buildReceipt(discoveries: Discovery[], skills: ParsedSkill[], trustReview: number): Receipt {
  const identities = new Set<string>();
  const clients = discoveries.map((d) => {
    for (const server of d.servers) identities.add(serverIdentity(server));
    return {
      id: d.client.id,
      displayName: d.client.displayName,
      configPath: d.configPath,
      serverCount: d.servers.length,
      note: d.parseError
        ? `could not parse (${d.parseError.slice(0, 80)})`
        : d.client.nativeToolSearch
          ? "schemas natively deferred, not loaded — Roster adds learning, failover suggestions, and cross-client sync"
          : "schema weight measured at first serve",
    };
  });

  const hasOpenclaw = discoveries.some((d) => d.client.id === "openclaw");
  const chars = hasOpenclaw ? openclawInjectionChars(skills) : 0;

  return {
    generatedAt: new Date().toISOString(),
    clients,
    uniqueServers: identities.size,
    skills: {
      count: skills.length,
      trustReview,
      openclaw: hasOpenclaw ? { chars, estTokens: estimateTokensFromChars(chars) } : null,
    },
    methodology:
      "Counts are read from your configs. Token figures are estimates (~4 chars/token); our own measurement puts the error at −37%…+27% depending on tokenizer family and payload type (docs/lab/notes-token-economics.md), so read them as ballpark, never exact. OpenClaw skill-injection chars follow its deterministic <available_skills> formula.",
  };
}

export function saveReceipt(receipt: Receipt): void {
  fs.mkdirSync(rosterHome(), { recursive: true });
  fs.writeFileSync(receiptPath(), `${JSON.stringify(receipt, null, 2)}\n`);
}

export function renderReceipt(receipt: Receipt): string {
  const lines: string[] = [];
  lines.push("─".repeat(64));
  lines.push("  ROSTER · Day-0 receipt");
  lines.push("─".repeat(64));
  if (receipt.clients.length === 0) {
    lines.push("  No MCP client configs found. Roster still works standalone —");
    lines.push("  add servers to ~/.roster/roster.json and point any client at `roster serve`.");
  }
  for (const client of receipt.clients) {
    lines.push(`  ${client.displayName.padEnd(14)} ${String(client.serverCount).padStart(3)} server(s)  ${client.configPath}`);
    lines.push(`  ${"".padEnd(14)} ${client.note}`);
  }
  lines.push("");
  lines.push(`  Unique servers across clients: ${receipt.uniqueServers}`);
  lines.push(`  Skills discovered: ${receipt.skills.count}${receipt.skills.trustReview > 0 ? `  (${receipt.skills.trustReview} flagged for review)` : ""}`);
  if (receipt.skills.openclaw) {
    lines.push(
      `  OpenClaw skill injection: ${receipt.skills.openclaw.chars.toLocaleString()} chars into EVERY prompt (≈${receipt.skills.openclaw.estTokens.toLocaleString()} tokens, estimate)`,
    );
  }
  lines.push("");
  lines.push(`  ${receipt.methodology}`);
  lines.push("─".repeat(64));
  return lines.join("\n");
}
