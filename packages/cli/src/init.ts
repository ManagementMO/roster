import { trustScan, defaultSkillSources, scanSkillSources } from "@rosterhq/playbook";
import { discoverClients } from "./clients.js";
import { buildReceipt, renderReceipt, saveReceipt } from "./receipt.js";
import { loadConfig, mergeServers, saveConfig } from "./rosterfile.js";
import { WRITE_CLIENTS } from "./sync.js";

/**
 * The 60-second path (§6.3): discover → import → receipt. No network, no
 * model download, no account. The receipt prints before anything heavy exists.
 */
export function init(): void {
  const discoveries = discoverClients();
  const imported = discoveries.flatMap((d) => d.servers);

  const config = loadConfig();
  const { added, merged } = mergeServers(config, imported);

  const skillSources = defaultSkillSources().filter(
    (src, i, all) => all.indexOf(src) === i,
  );
  config.skillSources = skillSources;
  const skills = scanSkillSources(skillSources);
  const trustReview = skills.filter((s) => trustScan(s).status === "review").length;

  saveConfig(config);

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
      `\nNext: \`roster sync\` swaps ${[...new Set(syncable)].join(", ")} to a single Roster entry (originals backed up; \`roster eject\` restores byte-for-byte).\n`,
    );
  }
  process.stdout.write(`Then point any agent at: roster serve\n`);
}
