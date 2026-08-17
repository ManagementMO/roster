import { trustScan, defaultSkillSources, scanSkillSources } from "@roster/playbook";
import { discoverClients } from "./clients.js";
import { buildReceipt, renderReceipt, saveReceipt } from "./receipt.js";
import { mergeServers, updateConfig } from "./rosterfile.js";
import { ownedRosterEntries, WRITE_CLIENTS } from "./sync.js";

/**
 * The 60-second path (§6.3): discover → import → receipt. No network, no
 * model download, no account. The receipt prints before anything heavy exists.
 */
export function init(): void {
  const discoveries = discoverClients();
  const imported = discoveries.flatMap((d) => d.servers);

  const { config, added, merged } = updateConfig((config) => {
    const result = mergeServers(config, imported, ownedRosterEntries());
    // Union with existing sources — a re-run must never clobber user additions.
    config.skillSources = [...new Set([...config.skillSources, ...defaultSkillSources()])];
    return { config, added: result.added, merged: result.merged };
  });
  const skillSources = config.skillSources;
  const skills = scanSkillSources(skillSources);
  const trustReview = skills.filter((s) => trustScan(s).status === "review").length;

  const receipt = buildReceipt(discoveries, skills, trustReview);
  saveReceipt(receipt);

  process.stdout.write(`${renderReceipt(receipt)}\n\n`);
  process.stdout.write(
    `Imported ${added.length} new server(s)${merged.length > 0 ? `, merged ${merged.length} duplicate definition(s)` : ""} into ~/.roster/roster.json\n`,
  );
  const syncable = discoveries
    .map((d) => d.client.id)
    .filter((id) => (WRITE_CLIENTS as string[]).includes(id));
  if (syncable.length > 0) {
    process.stdout.write(
      `\nNext: \`roster sync\` swaps ${[...new Set(syncable)].join(", ")} to a single Roster entry (originals backed up; \`roster eject\` puts everything back exactly as found).\n`,
    );
  }
  process.stdout.write(`Then point any agent at: roster serve\n`);
}
