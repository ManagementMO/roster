/**
 * EXP E — two follow-up micro-probes:
 *  e1: top-level-array config — does every re-sync create a NEW backup dir
 *      (isAlreadySynced can never become true because JSON.stringify drops
 *      the mcpServers property set on an array)?
 *  e2: JSONC comments in the user's config — confirmed byte-restored by eject,
 *      but what does the SYNCED (roster-era) config look like? (comment loss
 *      during the era is user-visible in the live file)
 */
import fs from "node:fs";
import { syncClient, ejectClient, freshHome, writeConfig, listBackupDirs, saveSection, SCRATCH } from "./exp-sync-eject-fuzz-lib.mjs";

process.chdir(SCRATCH);

// e1: repeated sync of an array-top-level config
const home1 = freshHome("e1-array-churn");
const cfg1 = writeConfig("claude-code", home1, Buffer.from("[]"));
const actions = [];
for (let i = 0; i < 4; i++) {
  const r = syncClient("claude-code", new Date(Date.UTC(2026, 6, 4, 12, 0, i)));
  actions.push(r.action);
}
const e1 = {
  actions,
  backupDirCount: listBackupDirs(home1, "claude-code").length,
  finalConfig: fs.readFileSync(cfg1, "utf8"),
  everBecomesAlreadySynced: actions.includes("already-synced"),
};
console.log("e1 array-top churn:", JSON.stringify(e1, null, 2));

// e2: comment fate in the SYNCED state
const home2 = freshHome("e2-comments");
const jsonc = `{\n  // IMPORTANT: work account only!\n  "mcpServers": {\n    /* legal-review server — do not remove */\n    "fs": {"command": "npx", "args": ["-y", "srv"]}\n  }\n  // billing notes: see wiki/mcp\n}\n`;
const cfg2 = writeConfig("cursor", home2, Buffer.from(jsonc));
syncClient("cursor", new Date("2026-07-04T12:00:00.000Z"));
const syncedState = fs.readFileSync(cfg2, "utf8");
const ej = ejectClient("cursor", {});
const e2 = {
  syncedStateContainsComments: syncedState.includes("//") || syncedState.includes("/*"),
  syncedState,
  eject: ej.action,
  restoredBytesIdentical: fs.readFileSync(cfg2, "utf8") === jsonc,
};
console.log("e2 comment fate:", JSON.stringify(e2, null, 2));

saveSection("e", { e1, e2 });
