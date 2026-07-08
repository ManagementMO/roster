import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "@rosterhq/coach";
import { CLIENTS, type ClientId } from "./clients.js";
import { parseJsonc } from "./jsonc.js";
import { atomicWriteFileSync, backupDirFor } from "./rosterfile.js";
import { listBackups, pristineRawBackup } from "./sync.js";

export interface EjectResult {
  client: ClientId;
  action: "restored" | "no-backup" | "refused-modified" | "missing-file";
  configPath?: string;
  detail?: string;
}

/**
 * The headline trust feature: restore the client's PRISTINE pre-Roster config
 * byte-for-byte — the OLDEST backup of the current era. The modified-since-
 * sync guard compares against the LATEST write to that same file: if the file
 * isn't what Roster last wrote, someone edited it and we refuse (without
 * --force) rather than clobber their work. All hashes are over raw bytes.
 * On success the era is CLOSED (backups archived) so the next sync snapshots
 * a fresh pristine — sync→eject cycles can never destroy in-between changes.
 */
export function ejectClient(clientId: ClientId, opts: { force?: boolean } = {}): EjectResult {
  const pristine = pristineRawBackup(clientId);
  if (!pristine) return { client: clientId, action: "no-backup" };
  // The OLDEST backup's manifest is missing or corrupt. Advancing to a newer
  // backup would silently restore the WRONG (user-edited, still-rosterized)
  // bytes — the measured 1-byte-tamper wrong-restore. Refuse loudly instead;
  // no --force can conjure a manifest we can trust to identify the pristine.
  if (!pristine.manifest) {
    return {
      client: clientId,
      action: "no-backup",
      detail:
        "BACKUP INTEGRITY FAILURE: the pristine backup's manifest is missing or corrupt — refusing to restore a different backup; inspect the backup dir",
    };
  }
  const manifest = pristine.manifest;
  const targetPath = manifest.sourcePath;
  // Config paths can be cwd-dependent; the guard must compare against the
  // latest write to the SAME file, never a different candidate path.
  const latest =
    listBackups(clientId)
      .filter((b) => b.manifest.sourcePath === targetPath)
      .pop() ?? { dir: pristine.dir, manifest };

  const originalPath = path.join(pristine.dir, "original");
  if (!fs.existsSync(originalPath)) {
    return { client: clientId, action: "no-backup", detail: "backup bytes missing" };
  }

  const originalBytes = fs.readFileSync(originalPath);
  if (sha256Hex(originalBytes) !== manifest.originalSha256) {
    return {
      client: clientId,
      action: "no-backup",
      configPath: targetPath,
      detail:
        "BACKUP INTEGRITY FAILURE: stored bytes do not match their recorded hash — not restoring; inspect the backup dir",
    };
  }

  const currentExists = fs.existsSync(targetPath);
  const isStateFile = CLIENTS.find((c) => c.id === clientId)?.stateFile === true && !targetPath.endsWith(".toml");

  // State file (~/.claude.json &c.): the client rewrites it constantly, so a
  // byte-restore would revert every unrelated setting and the modified-guard
  // would refuse forever. Restore KEY-LEVEL — put the ORIGINAL servers back,
  // KEEP servers the user added after sync (never destroy in-between work),
  // preserve all other live keys (M2). --force explicitly requests the raw
  // byte-restore instead.
  if (isStateFile && currentExists && !opts.force) {
    try {
      const restored = restoreServersKeyLevel(
        fs.readFileSync(targetPath, "utf8"),
        originalBytes.toString("utf8"),
      );
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      atomicWriteFileSync(targetPath, restored);
      archiveEra(clientId);
      return {
        client: clientId,
        action: "restored",
        configPath: targetPath,
        detail: "key-level restore (state file — live settings and post-sync servers preserved)",
      };
    } catch {
      // Current file unparseable → fall through to the GUARDED byte path.
    }
  }

  // Byte-for-byte restore (dedicated MCP files — preserves comments/formatting;
  // the --force override; and the fallback for an unparseable state file).
  if (!currentExists) {
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

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  atomicWriteFileSync(targetPath, originalBytes);
  archiveEra(clientId);
  return { client: clientId, action: "restored", configPath: targetPath };
}

/**
 * Rebuild the CURRENT config's `mcpServers` as: the ORIGINAL (pre-sync) servers,
 * PLUS any non-roster servers the user added while synced (current wins on a
 * name collision — their latest intent), MINUS the roster entry. Every other
 * current key is preserved. The sync→eject trust invariant — "cycles can never
 * destroy in-between changes" — must hold for servers added post-sync too
 * (round-4b self-review: the first version replaced the map wholesale and
 * silently dropped them). JSON-format state files only.
 */
function restoreServersKeyLevel(currentContent: string, originalContent: string): string {
  const current = parseJsonc(currentContent);
  if (current === null || typeof current !== "object" || Array.isArray(current)) {
    throw new Error("current config is not a JSON object");
  }
  const cur = current as Record<string, unknown>;
  const original = parseJsonc(originalContent);
  const origServers =
    original && typeof original === "object" && !Array.isArray(original)
      ? ((original as Record<string, unknown>).mcpServers as Record<string, unknown> | undefined)
      : undefined;
  const currentServers =
    cur.mcpServers && typeof cur.mcpServers === "object" && !Array.isArray(cur.mcpServers)
      ? { ...(cur.mcpServers as Record<string, unknown>) }
      : {};
  delete currentServers.roster;
  const merged = { ...(origServers ?? {}), ...currentServers };
  if (Object.keys(merged).length === 0 && origServers === undefined) {
    delete cur.mcpServers; // original had no servers key and the user added none
  } else {
    cur.mcpServers = merged;
  }
  return `${JSON.stringify(cur, null, 2)}\n`;
}

/** Best-effort era close: a failed archive must never fail the restore. */
function archiveEra(clientId: ClientId): void {
  const clientDir = path.dirname(backupDirFor(clientId, "x"));
  if (!fs.existsSync(clientDir)) return;
  const archived = `${clientDir}-ejected-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    fs.renameSync(clientDir, archived);
  } catch {
    /* keep the restore result */
  }
}
