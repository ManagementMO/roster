import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "@rosterhq/coach";
import { CLIENTS, type ClientId } from "./clients.js";
import { isRosterProxyEntry, sameEntry, type SpawnEntry } from "./entry.js";
import { parseJsonc } from "./jsonc.js";
import { atomicWriteFileSync, backupDirFor } from "./rosterfile.js";
import { closeEra, listBackups, pristineRawBackup } from "./sync.js";

export interface EjectResult {
  client: ClientId;
  action: "restored" | "no-backup" | "refused-modified" | "missing-file";
  configPath?: string;
  detail?: string;
}

/**
 * The headline trust feature: put the client back exactly as Roster found it —
 * from the OLDEST backup of the current era. Two restore modes by file kind:
 * dedicated MCP configs restore BYTE-FOR-BYTE (comments/formatting included),
 * guarded by modified-since-sync (refuse without --force if the file isn't
 * what Roster last wrote); live STATE files the client itself rewrites (e.g.
 * ~/.claude.json) restore KEY-LEVEL — original servers back, roster removed,
 * every other live key and post-sync server preserved (--force = raw bytes).
 * All hashes are over raw bytes. On success the era is CLOSED (backups
 * archived) so the next sync snapshots a fresh pristine — sync→eject cycles
 * can never destroy in-between changes.
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
  const isStateFile =
    CLIENTS.find((c) => c.id === clientId)?.stateFileBasename === path.basename(targetPath);

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
        manifest.injectedEntry,
      );
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      atomicWriteFileSync(targetPath, restored);
      return finishEject(clientId, targetPath, {
        detail: "key-level restore (state file — live settings and post-sync servers preserved)",
      });
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
  return finishEject(clientId, targetPath, {});
}

/**
 * The config is restored — now CLOSE THE ERA, durably, before we call this a
 * success. Archiving (the directory rename) is only tidy-up and is allowed to
 * fail; the closed-through marker is what actually prevents a later eject from
 * reaching back into this era and restoring stale bytes over the user's config
 * (R5-02). If even the marker cannot be written we say so loudly rather than
 * returning a clean "restored" that quietly leaves the trap armed.
 */
function finishEject(clientId: ClientId, targetPath: string, opts: { detail?: string }): EjectResult {
  // Two independent ways to close an era: record the boundary, or move the whole
  // era's backups out of reach. EITHER is sufficient; only if BOTH fail is a later
  // eject still able to restore this era's stale bytes.
  const marked = closeEra(clientId);
  const archived = archiveEra(clientId);
  if (!marked && !archived) {
    return {
      client: clientId,
      action: "restored",
      configPath: targetPath,
      detail:
        "restored, BUT the backup era could not be closed (backups dir not writable) — " +
        "fix permissions on ~/.roster/backups and re-run `roster eject`, or a later eject could restore these stale bytes",
    };
  }
  return { client: clientId, action: "restored", configPath: targetPath, ...opts };
}

/**
 * Rebuild the CURRENT config's `mcpServers` as: the ORIGINAL (pre-sync) servers,
 * PLUS any servers the user added while synced (current wins on a name collision
 * — their latest intent), MINUS the entry Roster itself installed. Every other
 * current key is preserved. The sync→eject trust invariant — "cycles can never
 * destroy in-between changes" — must hold for servers added post-sync too
 * (round-4b self-review: the first version replaced the map wholesale and
 * silently dropped them). JSON-format state files only.
 *
 * What we remove is identified by the EXACT entry recorded in the backup manifest
 * — never by the key name. `delete servers.roster` destroyed a server the user
 * added under that name after syncing (R5-01): eject's one promise is that it
 * never loses your work, and a name is not an identity. Backups written before
 * this fix carry no recorded entry; those fall back to the structural test, which
 * still refuses to delete anything that isn't shaped like a Roster proxy entry.
 */
function restoreServersKeyLevel(
  currentContent: string,
  originalContent: string,
  injected: SpawnEntry | undefined,
): string {
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
  for (const [name, entry] of Object.entries(currentServers)) {
    const isOurs = injected ? sameEntry(entry, injected) : isRosterProxyEntry(entry);
    if (isOurs) delete currentServers[name];
  }
  const merged = { ...(origServers ?? {}), ...currentServers };
  if (Object.keys(merged).length === 0 && origServers === undefined) {
    delete cur.mcpServers; // original had no servers key and the user added none
  } else {
    cur.mcpServers = merged;
  }
  return `${JSON.stringify(cur, null, 2)}\n`;
}

/**
 * Move the whole era's backups aside. Tidy-up, and a SECOND way to close the era:
 * if the directory is gone, no later eject can reach its backups either. Still
 * best-effort — a failed archive must never fail the restore — but its success or
 * failure is now reported, because correctness depends on at least one of the two
 * closures landing (see finishEject).
 */
function archiveEra(clientId: ClientId): boolean {
  const clientDir = path.dirname(backupDirFor(clientId, "x"));
  if (!fs.existsSync(clientDir)) return true; // nothing left to archive
  const archived = `${clientDir}-ejected-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    fs.renameSync(clientDir, archived);
    return true;
  } catch {
    return false; // keep the restore result; the marker is the durable guarantee
  }
}
