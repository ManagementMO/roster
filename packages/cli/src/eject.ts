import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "@rosterhq/coach";
import { CLIENTS, type ClientId } from "./clients.js";
import { normalizeSpawnEntry, sameEntry, type SpawnEntry } from "./entry.js";
import {
  clearEjectJournal,
  createEjectJournal,
  type EjectJournalTarget,
  type LoadedEjectJournal,
  loadEjectJournal,
  type PreparedJournalTarget,
  readDesiredBytes,
} from "./ejectJournal.js";
import { parseJsonc } from "./jsonc.js";
import { withFileLockSync } from "./lock.js";
import {
  atomicWriteFileSync,
  backupDirFor,
  PRIVATE_DIR,
  validateWriteTopology,
} from "./rosterfile.js";
import {
  type BackupManifest,
  closeEraThrough,
  type RawBackup,
  rawBackups,
  readClosedThrough,
} from "./sync.js";
import { readRegularFileNoFollow } from "./safeFile.js";

export interface EjectResult {
  client: ClientId;
  action:
    | "restored"
    | "no-backup"
    | "refused-modified"
    | "missing-file"
    | "integrity-error";
  configPath?: string;
  detail?: string;
  restoredPaths?: string[];
}

interface PlannedRestore extends PreparedJournalTarget {
  stateContext?: {
    originalBytes: Buffer;
    injectedEntries: SpawnEntry[];
  };
}

type ValidBackup = RawBackup & { manifest: BackupManifest };

/**
 * The headline trust feature: put the client back exactly as Roster found it —
 * from the OLDEST backup PER PATH in the current era. Two restore modes by file kind:
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
  return withFileLockSync(`client:${clientId}`, () =>
    ejectClientUnlocked(clientId, opts),
  );
}

function ejectClientUnlocked(
  clientId: ClientId,
  opts: { force?: boolean },
): EjectResult {
  let pending: LoadedEjectJournal | null;
  try {
    pending = loadEjectJournal(clientId);
  } catch (error) {
    return integrityFailure(
      clientId,
      `pending eject recovery data is corrupt — refusing: ${errorMessage(error)}`,
    );
  }
  if (pending) return applyJournal(clientId, pending);

  let slots: RawBackup[];
  try {
    slots = rawBackups(clientId);
  } catch (error) {
    return integrityFailure(
      clientId,
      `the backup era boundary is unreadable or corrupt: ${errorMessage(error)}`,
    );
  }
  if (slots.length === 0) return { client: clientId, action: "no-backup" };
  if (slots.some((slot) => slot.manifest === null)) {
    return integrityFailure(
      clientId,
      "the active backup set has a missing, corrupt, or non-directory slot — refusing every restore",
    );
  }
  const backups = slots as ValidBackup[];
  try {
    for (const backup of backups) validateManifest(clientId, backup);
  } catch (error) {
    return integrityFailure(clientId, errorMessage(error));
  }

  const groups = new Map<string, ValidBackup[]>();
  for (const backup of backups) {
    const group = groups.get(backup.manifest.sourcePath) ?? [];
    group.push(backup);
    groups.set(backup.manifest.sourcePath, group);
  }
  const planned: PlannedRestore[] = [];
  for (const [sourcePath, group] of [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const result = planRestore(clientId, sourcePath, group, opts.force === true);
    if ("action" in result) return result;
    planned.push(result);
  }
  const stable = stabilizeStateTargets(clientId, planned);
  if (stable) return stable;

  const boundary = backups.at(-1)!.name;
  let journal: LoadedEjectJournal;
  try {
    journal = createEjectJournal(clientId, boundary, planned);
  } catch (error) {
    return integrityFailure(
      clientId,
      `could not persist the eject recovery journal before writing configs: ${errorMessage(error)}`,
    );
  }
  return applyJournal(clientId, journal);
}

function planRestore(
  clientId: ClientId,
  sourcePath: string,
  backups: ValidBackup[],
  force: boolean,
): PlannedRestore | EjectResult {
  const pristine = backups[0]!;
  const latest = backups.at(-1)!;
  let topology: Pick<BackupManifest, "writePath" | "symlinkTarget">;
  try {
    topology = newestTopology(backups);
  } catch (error) {
    return integrityFailure(clientId, `${sourcePath}: ${errorMessage(error)}`, sourcePath);
  }
  let writePath: string;
  try {
    writePath = validateWriteTopology(
      sourcePath,
      topology.writePath,
      topology.symlinkTarget,
    );
  } catch (error) {
    return {
      client: clientId,
      action: "refused-modified",
      configPath: sourcePath,
      detail: `config symlink/topology changed after sync — refusing restore: ${errorMessage(error)}`,
    };
  }
  let originalBytes: Buffer;
  try {
    const originalPath = path.join(pristine.dir, "original");
    originalBytes = readRegularFileNoFollow(originalPath);
    if (sha256Hex(originalBytes) !== pristine.manifest.originalSha256) {
      throw new Error("stored pristine bytes do not match their recorded hash");
    }
  } catch (error) {
    return integrityFailure(
      clientId,
      `${sourcePath}: ${errorMessage(error)} — not restoring`,
      sourcePath,
    );
  }

  const currentBytes = readRegularFileIfPresent(writePath, 4);
  const stateFile =
    CLIENTS.find((client) => client.id === clientId)?.stateFileBasename ===
    path.basename(sourcePath);
  const injectedEntries = backups
    .map((backup) => normalizeSpawnEntry(backup.manifest.injectedEntry))
    .filter((entry): entry is SpawnEntry => entry !== null);

  if (stateFile && currentBytes && !force) {
    if (!normalizeSpawnEntry(latest.manifest.injectedEntry)) {
      return {
        client: clientId,
        action: "refused-modified",
        configPath: sourcePath,
        detail:
          "legacy backup has no exact injected-entry identity; refusing key-level deletion — use --force for an explicit pristine byte restore",
      };
    }
    try {
      const desired = restoreServersKeyLevel(
        currentBytes.toString("utf8"),
        originalBytes.toString("utf8"),
        injectedEntries,
      );
      return {
        sourcePath,
        ...(topology.writePath !== undefined
          ? { writePath: topology.writePath }
          : {}),
        ...(topology.symlinkTarget !== undefined
          ? { symlinkTarget: topology.symlinkTarget }
          : {}),
        beforeSha256: sha256Hex(currentBytes),
        desiredBytes: Buffer.from(desired),
        stateContext: { originalBytes, injectedEntries },
      };
    } catch {
      // An unparseable state file uses the guarded byte-for-byte path below.
    }
  }

  if (!currentBytes && !force) {
    return {
      client: clientId,
      action: "missing-file",
      configPath: sourcePath,
      detail: "config file no longer exists; use --force to recreate it from backup",
    };
  }
  if (
    currentBytes &&
    sha256Hex(currentBytes) !== latest.manifest.writtenSha256 &&
    !force
  ) {
    return {
      client: clientId,
      action: "refused-modified",
      configPath: sourcePath,
      detail:
        "config was modified after sync — refusing to overwrite those edits; re-run with --force to restore the pristine backup anyway",
    };
  }
  return {
    sourcePath,
    ...(topology.writePath !== undefined ? { writePath: topology.writePath } : {}),
    ...(topology.symlinkTarget !== undefined
      ? { symlinkTarget: topology.symlinkTarget }
      : {}),
    beforeSha256: currentBytes ? sha256Hex(currentBytes) : null,
    desiredBytes: originalBytes,
  };
}

function validateManifest(clientId: ClientId, backup: ValidBackup): void {
  const { manifest } = backup;
  if (
    manifest.client !== clientId ||
    typeof manifest.sourcePath !== "string" ||
    !path.isAbsolute(manifest.sourcePath) ||
    manifest.timestamp !== backup.name ||
    !/^[a-f0-9]{64}$/.test(manifest.originalSha256) ||
    !/^[a-f0-9]{64}$/.test(manifest.writtenSha256) ||
    (manifest.writePath !== undefined &&
      (typeof manifest.writePath !== "string" ||
        !path.isAbsolute(manifest.writePath))) ||
    (manifest.symlinkTarget !== undefined &&
      typeof manifest.symlinkTarget !== "string") ||
    (manifest.symlinkTarget !== undefined && manifest.writePath === undefined)
  ) {
    throw new Error(
      `backup ${backup.name} has invalid or mismatched manifest fields`,
    );
  }
  const originalPath = path.join(backup.dir, "original");
  if (sha256Hex(readRegularFileNoFollow(originalPath)) !== manifest.originalSha256) {
    throw new Error(`backup ${backup.name} original bytes failed their hash check`);
  }
}

function newestTopology(
  backups: ValidBackup[],
): Pick<BackupManifest, "writePath" | "symlinkTarget"> {
  const recorded = backups.filter(
    (backup) =>
      backup.manifest.writePath !== undefined ||
      backup.manifest.symlinkTarget !== undefined,
  );
  if (recorded.length === 0) return {};
  const newest = recorded.at(-1)!.manifest;
  for (const backup of recorded) {
    if (
      backup.manifest.writePath !== newest.writePath ||
      backup.manifest.symlinkTarget !== newest.symlinkTarget
    ) {
      throw new Error(
        "write topology changed between backups; refusing to guess which target owns the pristine bytes",
      );
    }
  }
  return {
    ...(newest.writePath !== undefined ? { writePath: newest.writePath } : {}),
    ...(newest.symlinkTarget !== undefined
      ? { symlinkTarget: newest.symlinkTarget }
      : {}),
  };
}

/**
 * Apply or resume a durable journal. Every target is preflighted before the
 * first write. A desired hash means a prior write landed, a before hash means
 * it remains safe to apply, and any third hash is a user change we refuse.
 */
function applyJournal(
  clientId: ClientId,
  journal: LoadedEjectJournal,
): EjectResult {
  const restoredPaths = journal.plan.targets.map((target) => target.sourcePath);
  let alreadyClosed: string | null;
  try {
    alreadyClosed = readClosedThrough(clientId);
  } catch (error) {
    return integrityFailure(
      clientId,
      `the backup era boundary is unreadable or corrupt: ${errorMessage(error)}`,
    );
  }
  if (alreadyClosed !== null && alreadyClosed >= journal.plan.boundary) {
    try {
      clearEjectJournal(journal);
    } catch (error) {
      return integrityFailure(
        clientId,
        `the eject era is closed but its recovery journal could not be cleared: ${errorMessage(error)}`,
      );
    }
    archiveEraThrough(clientId, journal.plan.boundary);
    return restoredResult(clientId, restoredPaths, "completed interrupted eject cleanup");
  }

  const prepared: Array<{
    target: EjectJournalTarget;
    desiredBytes: Buffer;
    writePath: string;
    pending: boolean;
  }> = [];
  for (const target of journal.plan.targets) {
    let desiredBytes: Buffer;
    let writePath: string;
    try {
      desiredBytes = readDesiredBytes(journal, target);
      writePath = validateWriteTopology(
        target.sourcePath,
        target.writePath,
        target.symlinkTarget,
      );
    } catch (error) {
      return integrityFailure(
        clientId,
        `${target.sourcePath}: pending eject recovery failed validation: ${errorMessage(error)}`,
        target.sourcePath,
      );
    }
    const currentSha256 = hashIfPresent(writePath);
    if (currentSha256 === target.desiredSha256) {
      prepared.push({ target, desiredBytes, writePath, pending: false });
      continue;
    }
    if (currentSha256 !== target.beforeSha256) {
      return integrityFailure(
        clientId,
        `${target.sourcePath}: config changed to a third state during interrupted eject; refusing to overwrite it`,
        target.sourcePath,
      );
    }
    prepared.push({ target, desiredBytes, writePath, pending: true });
  }

  for (const item of prepared) {
    if (!item.pending) continue;
    try {
      const checkedWritePath = validateWriteTopology(
        item.target.sourcePath,
        item.target.writePath,
        item.target.symlinkTarget,
      );
      const currentSha256 = hashIfPresent(checkedWritePath);
      if (currentSha256 === item.target.desiredSha256) continue;
      if (currentSha256 !== item.target.beforeSha256) {
        throw new Error("config changed after eject preflight");
      }
      fs.mkdirSync(path.dirname(item.target.sourcePath), {
        recursive: true,
        mode: PRIVATE_DIR,
      });
      const finalWritePath = validateWriteTopology(
        item.target.sourcePath,
        item.target.writePath,
        item.target.symlinkTarget,
      );
      atomicWriteFileSync(finalWritePath, item.desiredBytes);
      if (hashIfPresent(finalWritePath) !== item.target.desiredSha256) {
        throw new Error("restored bytes failed their post-write hash check");
      }
    } catch (error) {
      return integrityFailure(
        clientId,
        `${item.target.sourcePath}: eject write stopped safely and remains recoverable: ${errorMessage(error)}`,
        item.target.sourcePath,
      );
    }
  }

  let marked: boolean;
  try {
    marked = closeEraThrough(clientId, journal.plan.boundary);
  } catch (error) {
    return integrityFailure(
      clientId,
      `the backup era boundary is unreadable or corrupt: ${errorMessage(error)}`,
    );
  }
  if (!marked && !archiveEraThrough(clientId, journal.plan.boundary)) {
    return integrityFailure(
      clientId,
      "configs were restored, but the exact backup era could not be closed; recovery data was retained",
      restoredPaths[0],
    );
  }
  try {
    clearEjectJournal(journal);
  } catch (error) {
    return integrityFailure(
      clientId,
      `configs were restored and the era is closed, but recovery cleanup failed: ${errorMessage(error)}`,
      restoredPaths[0],
    );
  }
  if (marked) archiveEraThrough(clientId, journal.plan.boundary);
  return restoredResult(clientId, restoredPaths);
}

function restoredResult(
  clientId: ClientId,
  restoredPaths: string[],
  detail?: string,
): EjectResult {
  return {
    client: clientId,
    action: "restored",
    configPath: restoredPaths[0],
    restoredPaths,
    ...(detail ? { detail } : {}),
  };
}

function hashIfPresent(target: string): string | null {
  const bytes = readRegularFileIfPresent(target, 4);
  return bytes === null ? null : sha256Hex(bytes);
}

function readRegularFileIfPresent(
  target: string,
  attempts = 1,
): Buffer | null {
  try {
    return readRegularFileNoFollow(target, { attempts });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function integrityFailure(
  clientId: ClientId,
  detail: string,
  configPath?: string,
): EjectResult {
  return {
    client: clientId,
    action: "integrity-error",
    ...(configPath ? { configPath } : {}),
    detail: `BACKUP INTEGRITY FAILURE: ${detail}`,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * State files can change while eject is planning. Require a full stable pass
 * immediately before journal publication; every observed change is folded into
 * the desired key-level merge. A continuously changing file is refused.
 */
function stabilizeStateTargets(
  clientId: ClientId,
  targets: PlannedRestore[],
): EjectResult | null {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const target of targets) {
      if (!target.stateContext) continue;
      let writePath: string;
      try {
        writePath = validateWriteTopology(
          target.sourcePath,
          target.writePath,
          target.symlinkTarget,
        );
      } catch (error) {
        return {
          client: clientId,
          action: "refused-modified",
          configPath: target.sourcePath,
          detail: `config topology changed while planning eject: ${errorMessage(error)}`,
        };
      }
      const currentBytes = readRegularFileIfPresent(writePath, 4);
      if (currentBytes === null) {
        return {
          client: clientId,
          action: "refused-modified",
          configPath: target.sourcePath,
          detail: "state file disappeared while planning eject",
        };
      }
      const currentSha256 = sha256Hex(currentBytes);
      if (currentSha256 === target.beforeSha256) continue;
      try {
        target.desiredBytes = Buffer.from(
          restoreServersKeyLevel(
            currentBytes.toString("utf8"),
            target.stateContext.originalBytes.toString("utf8"),
            target.stateContext.injectedEntries,
          ),
        );
      } catch {
        return {
          client: clientId,
          action: "refused-modified",
          configPath: target.sourcePath,
          detail: "state file became unparseable while planning eject",
        };
      }
      target.beforeSha256 = currentSha256;
      changed = true;
    }
    if (!changed) return null;
  }
  return {
    client: clientId,
    action: "refused-modified",
    detail: "state files kept changing while eject was planning; retry when the client is idle",
  };
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
 * never loses your work, and a name is not an identity. A legacy state-file
 * backup without that identity refuses key-level deletion; `--force` is the
 * explicit byte-for-byte recovery path.
 */
function restoreServersKeyLevel(
  currentContent: string,
  originalContent: string,
  injectedEntries: readonly SpawnEntry[],
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
    if (injectedEntries.some((injected) => sameEntry(entry, injected))) {
      delete currentServers[name];
    }
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
 * Archive only the planned boundary. Normally no newer backup can exist because
 * sync and eject share a client lock and sync refuses a pending journal, so the
 * whole client directory can move atomically. The partial path is a fail-safe
 * for externally modified backup trees.
 */
function archiveEraThrough(clientId: ClientId, boundary: string): boolean {
  const clientDir = path.dirname(backupDirFor(clientId, "x"));
  if (!fs.existsSync(clientDir)) return true; // nothing left to archive
  const archived = `${clientDir}-ejected-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    const backupNames = fs
      .readdirSync(clientDir)
      .filter((name) => !name.startsWith(".") && name !== "latest")
      .sort();
    if (backupNames.every((name) => name <= boundary)) {
      fs.renameSync(clientDir, archived);
      return true;
    }
    fs.mkdirSync(archived, { mode: PRIVATE_DIR });
    for (const name of backupNames.filter((name) => name <= boundary)) {
      fs.renameSync(path.join(clientDir, name), path.join(archived, name));
    }
    return true;
  } catch {
    return false;
  }
}
