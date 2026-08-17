import { estimateTokensFromChars } from "@roster/shared";
import { openclawInjectionChars, type ParsedSkill } from "@roster/playbook";
import type { Discovery } from "./clients.js";
import { isOwnedRosterEntry, type SpawnEntry } from "./entry.js";
import { ensureRosterHome, PRIVATE_FILE, receiptPath } from "./paths.js";
import { atomicWriteFileSync, serverIdentity } from "./rosterfile.js";

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

/**
 * Servers Roster routes on a client's behalf, keyed by client id.
 *
 * Needed because after `roster sync` a client's config legitimately holds ONE
 * entry — Roster's own proxy. Counting the config verbatim then reported
 * "Cursor 1 server(s)" to someone who still has three, and counted Roster
 * itself as if it were one of their tools. The receipt's whole promise is that
 * every number is real, so a synced client reports what is actually routed.
 */
function routedByClient(routed: RoutedServers | undefined): Map<string, Set<string>> {
  const byClient = new Map<string, Set<string>>();
  for (const [name, server] of Object.entries(routed ?? {})) {
    for (const client of server.importedFrom) {
      const set = byClient.get(client) ?? new Set<string>();
      set.add(name);
      byClient.set(client, set);
    }
  }
  return byClient;
}

export type RoutedServers = Record<string, { importedFrom: readonly string[] }>;

export function buildReceipt(
  discoveries: Discovery[],
  skills: ParsedSkill[],
  trustReview: number,
  routed?: RoutedServers,
  ownedEntries: readonly SpawnEntry[] = [],
): Receipt {
  const identities = new Set<string>();
  const byClient = routedByClient(routed);
  const clients = discoveries.map((d) => {
    // Roster's own entry is not one of the user's servers; never count it.
    // Rebuild the entry with only the keys that were actually present:
    // `normalizeSpawnEntry` refuses ownership on any unexpected key, and an
    // explicit `env: undefined` counts as one — which silently made every
    // synced client look unsynced.
    const theirs = d.servers.filter((s) => {
      const candidate: Record<string, unknown> = { command: s.command, args: s.args };
      if (s.env !== undefined) candidate.env = s.env;
      return !isOwnedRosterEntry(candidate, ownedEntries);
    });
    const synced = theirs.length < d.servers.length;
    const routedHere = byClient.get(d.client.id) ?? new Set<string>();
    for (const server of theirs) identities.add(serverIdentity(server));
    if (synced) for (const name of routedHere) identities.add(`routed:${name}`);
    return {
      id: d.client.id,
      displayName: d.client.displayName,
      configPath: d.configPath,
      serverCount: synced ? routedHere.size : theirs.length,
      note: d.parseError
        ? `could not parse (${d.parseError.slice(0, 80)})`
        : synced
          ? "routed through Roster — originals backed up; `roster eject` restores them"
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

/**
 * The receipt names every detected client and the absolute path of its config —
 * the same "which clients does this person run" inventory the backups directory
 * is kept at 0700 to protect. It was written with the default umask (0644), so
 * it is now owner-only and atomic like every other file Roster owns (R6-01).
 */
export function saveReceipt(receipt: Receipt): void {
  ensureRosterHome();
  atomicWriteFileSync(receiptPath(), `${JSON.stringify(receipt, null, 2)}\n`, PRIVATE_FILE);
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
