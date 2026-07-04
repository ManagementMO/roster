import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "@rosterhq/coach";
import type { ClientId } from "./clients.js";
import { latestBackup, oldestBackup } from "./sync.js";

export interface EjectResult {
  client: ClientId;
  action: "restored" | "no-backup" | "refused-modified" | "missing-file";
  configPath?: string;
  detail?: string;
}

/**
 * The headline trust feature: restore the client's PRISTINE pre-Roster config
 * byte-for-byte — the OLDEST backup, so repeated syncs can never launder a
 * rosterized file into "the original". The modified-since-sync guard compares
 * against the LATEST write: if the file isn't what Roster last wrote, someone
 * edited it and we refuse (without --force) rather than clobber their work.
 * All hashes are over raw bytes — lossy UTF-8 decodes could false-pass.
 */
export function ejectClient(clientId: ClientId, opts: { force?: boolean } = {}): EjectResult {
  const pristine = oldestBackup(clientId);
  const latest = latestBackup(clientId);
  if (!pristine || !latest) return { client: clientId, action: "no-backup" };

  const originalPath = path.join(pristine.dir, "original");
  if (!fs.existsSync(originalPath)) {
    return { client: clientId, action: "no-backup", detail: "backup bytes missing" };
  }
  const targetPath = pristine.manifest.sourcePath;

  if (!fs.existsSync(targetPath)) {
    if (!opts.force) {
      return {
        client: clientId,
        action: "missing-file",
        configPath: targetPath,
        detail: "config file no longer exists; use --force to recreate it from backup",
      };
    }
  } else {
    const currentSha = sha256Hex(fs.readFileSync(targetPath));
    if (currentSha !== latest.manifest.writtenSha256 && !opts.force) {
      return {
        client: clientId,
        action: "refused-modified",
        configPath: targetPath,
        detail:
          "config was modified after sync — refusing to overwrite those edits; re-run with --force to restore the pristine backup anyway",
      };
    }
  }

  const originalBytes = fs.readFileSync(originalPath);
  if (sha256Hex(originalBytes) !== pristine.manifest.originalSha256) {
    return {
      client: clientId,
      action: "no-backup",
      configPath: targetPath,
      detail: "BACKUP INTEGRITY FAILURE: stored bytes do not match their recorded hash — not restoring; inspect the backup dir",
    };
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.roster-tmp`;
  fs.writeFileSync(tmpPath, originalBytes);
  fs.renameSync(tmpPath, targetPath);
  return { client: clientId, action: "restored", configPath: targetPath };
}
