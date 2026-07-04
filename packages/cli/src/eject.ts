import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "@rosterhq/coach";
import type { ClientId } from "./clients.js";
import { latestBackup } from "./sync.js";

export interface EjectResult {
  client: ClientId;
  action: "restored" | "no-backup" | "refused-modified" | "missing-file";
  configPath?: string;
  detail?: string;
}

/**
 * The headline trust feature: restore the client config byte-for-byte from the
 * pre-sync backup. If the file changed since WE wrote it, someone else edited
 * it — refuse without --force so we never clobber their work silently.
 */
export function ejectClient(clientId: ClientId, opts: { force?: boolean } = {}): EjectResult {
  const backup = latestBackup(clientId);
  if (!backup) return { client: clientId, action: "no-backup" };

  const { manifest, dir } = backup;
  const originalPath = path.join(dir, "original");
  if (!fs.existsSync(originalPath)) {
    return { client: clientId, action: "no-backup", detail: "backup bytes missing" };
  }

  if (!fs.existsSync(manifest.sourcePath)) {
    if (!opts.force) {
      return {
        client: clientId,
        action: "missing-file",
        configPath: manifest.sourcePath,
        detail: "config file no longer exists; use --force to recreate it from backup",
      };
    }
  } else {
    const currentSha = sha256Hex(fs.readFileSync(manifest.sourcePath, "utf8"));
    if (currentSha !== manifest.writtenSha256 && !opts.force) {
      return {
        client: clientId,
        action: "refused-modified",
        configPath: manifest.sourcePath,
        detail:
          "config was modified after sync — refusing to overwrite those edits; re-run with --force to restore the backup anyway",
      };
    }
  }

  const originalBytes = fs.readFileSync(originalPath);
  fs.mkdirSync(path.dirname(manifest.sourcePath), { recursive: true });
  fs.writeFileSync(manifest.sourcePath, originalBytes);

  const restoredSha = sha256Hex(originalBytes.toString("utf8"));
  if (restoredSha !== manifest.originalSha256) {
    // Backup corruption would be a catastrophic trust failure — surface loudly.
    return {
      client: clientId,
      action: "restored",
      configPath: manifest.sourcePath,
      detail: "WARNING: restored bytes did not match recorded hash — inspect the backup dir",
    };
  }
  return { client: clientId, action: "restored", configPath: manifest.sourcePath };
}
