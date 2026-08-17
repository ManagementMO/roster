import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "@roster/coach";
import type { ClientId } from "./clients.js";
import type { SpawnEntry } from "./entry.js";
import { atomicWriteFileSync, PRIVATE_DIR, PRIVATE_FILE } from "./rosterfile.js";
import { rosterHome } from "./paths.js";
import { readRegularFileNoFollow } from "./safeFile.js";

export interface EjectJournalTarget {
  sourcePath: string;
  writePath?: string;
  symlinkTarget?: string;
  beforeSha256: string | null;
  desiredSha256: string;
  desiredFile: string;
  /**
   * Key-level (state-file) targets carry the inputs to RE-DERIVE their merge on
   * resume — the pre-sync original bytes and the exact injected proxy entries —
   * so a state file the client rewrote to a third state after a crash can still
   * be recovered idempotently instead of deadlocking eject and sync (NEW-3).
   * Absent for dedicated byte-restore targets, which keep the strict hash guard.
   */
  keyLevel?: boolean;
  originalFile?: string;
  originalSha256?: string;
  injectedEntries?: SpawnEntry[];
}

export interface EjectJournalPlan {
  version: 1;
  client: ClientId;
  boundary: string;
  targets: EjectJournalTarget[];
}

export interface PreparedJournalTarget {
  sourcePath: string;
  writePath?: string;
  symlinkTarget?: string;
  beforeSha256: string | null;
  desiredBytes: Buffer;
  /** Set for key-level state-file targets to enable idempotent resume (NEW-3). */
  keyLevel?: boolean;
  originalBytes?: Buffer;
  injectedEntries?: readonly SpawnEntry[];
}

export interface LoadedEjectJournal {
  dir: string;
  plan: EjectJournalPlan;
}

function journalRoot(): string {
  return path.join(rosterHome(), "eject-journals");
}

function journalDir(clientId: ClientId): string {
  return path.join(journalRoot(), clientId);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isSpawnEntryArray(value: unknown): value is SpawnEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (e) =>
        e !== null &&
        typeof e === "object" &&
        typeof (e as { command?: unknown }).command === "string" &&
        Array.isArray((e as { args?: unknown }).args) &&
        (e as { args: unknown[] }).args.every((a) => typeof a === "string"),
    )
  );
}

function parsePlan(value: unknown, clientId: ClientId): EjectJournalPlan {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("pending eject plan is not an object");
  }
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || raw.client !== clientId || typeof raw.boundary !== "string" || raw.boundary === "") {
    throw new Error("pending eject plan identity is invalid");
  }
  if (!Array.isArray(raw.targets) || raw.targets.length === 0) {
    throw new Error("pending eject plan has no targets");
  }
  const seenSources = new Set<string>();
  const seenFiles = new Set<string>();
  const targets = raw.targets.map((value, index): EjectJournalTarget => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`pending eject target ${index} is invalid`);
    }
    const target = value as Record<string, unknown>;
    if (
      typeof target.sourcePath !== "string" ||
      !path.isAbsolute(target.sourcePath) ||
      (target.writePath !== undefined &&
        (typeof target.writePath !== "string" || !path.isAbsolute(target.writePath))) ||
      (target.symlinkTarget !== undefined && typeof target.symlinkTarget !== "string") ||
      (target.beforeSha256 !== null && !isHash(target.beforeSha256)) ||
      !isHash(target.desiredSha256) ||
      typeof target.desiredFile !== "string" ||
      !/^target-[0-9]+\.bin$/.test(target.desiredFile)
    ) {
      throw new Error(`pending eject target ${index} has invalid fields`);
    }
    const keyLevel = target.keyLevel === true;
    if (keyLevel) {
      if (
        typeof target.originalFile !== "string" ||
        !/^original-[0-9]+\.bin$/.test(target.originalFile) ||
        !isHash(target.originalSha256) ||
        !isSpawnEntryArray(target.injectedEntries)
      ) {
        throw new Error(`pending eject target ${index} has invalid key-level recovery fields`);
      }
    }
    if (seenSources.has(target.sourcePath) || seenFiles.has(target.desiredFile)) {
      throw new Error("pending eject plan contains duplicate targets");
    }
    seenSources.add(target.sourcePath);
    seenFiles.add(target.desiredFile);
    return {
      sourcePath: target.sourcePath,
      ...(target.writePath !== undefined ? { writePath: target.writePath } : {}),
      ...(target.symlinkTarget !== undefined
        ? { symlinkTarget: target.symlinkTarget }
        : {}),
      beforeSha256: target.beforeSha256,
      desiredSha256: target.desiredSha256,
      desiredFile: target.desiredFile,
      ...(keyLevel
        ? {
            keyLevel: true,
            originalFile: target.originalFile as string,
            originalSha256: target.originalSha256 as string,
            injectedEntries: (target.injectedEntries as SpawnEntry[]).map((e) => ({
              command: e.command,
              args: [...e.args],
            })),
          }
        : {}),
    };
  });
  return { version: 1, client: clientId, boundary: raw.boundary, targets };
}

function ensurePrivateDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR });
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`eject journal path is not a regular directory: ${dir}`);
  }
  fs.chmodSync(dir, PRIVATE_DIR);
}

function fsyncDirectory(dir: string): void {
  try {
    const fd = fs.openSync(dir, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync is unavailable on some platforms/filesystems.
  }
}

export function hasEjectJournal(clientId: ClientId): boolean {
  return fs.existsSync(journalDir(clientId));
}

export function loadEjectJournal(clientId: ClientId): LoadedEjectJournal | null {
  const dir = journalDir(clientId);
  if (!fs.existsSync(dir)) return null;
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("pending eject journal is not a regular directory");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      readRegularFileNoFollow(path.join(dir, "plan.json")).toString("utf8"),
    );
  } catch (error) {
    throw new Error(
      `pending eject plan is missing or corrupt: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { dir, plan: parsePlan(parsed, clientId) };
}

export function createEjectJournal(
  clientId: ClientId,
  boundary: string,
  targets: readonly PreparedJournalTarget[],
): LoadedEjectJournal {
  if (targets.length === 0) throw new Error("cannot journal an eject with no targets");
  const root = journalRoot();
  ensurePrivateDirectory(root);
  const destination = journalDir(clientId);
  if (fs.existsSync(destination)) {
    throw new Error("a pending eject journal already exists");
  }
  const staging = path.join(
    root,
    `.staging-${clientId}-${process.pid}-${crypto.randomBytes(6).toString("hex")}`,
  );
  fs.mkdirSync(staging, { mode: PRIVATE_DIR });
  try {
    const journalTargets = targets.map((target, index): EjectJournalTarget => {
      const desiredFile = `target-${index}.bin`;
      const desiredSha256 = sha256Hex(target.desiredBytes);
      atomicWriteFileSync(
        path.join(staging, desiredFile),
        target.desiredBytes,
        PRIVATE_FILE,
      );
      const keyLevel = target.keyLevel === true && target.originalBytes !== undefined;
      let originalFields: Pick<
        EjectJournalTarget,
        "keyLevel" | "originalFile" | "originalSha256" | "injectedEntries"
      > = {};
      if (keyLevel) {
        const originalFile = `original-${index}.bin`;
        atomicWriteFileSync(path.join(staging, originalFile), target.originalBytes!, PRIVATE_FILE);
        originalFields = {
          keyLevel: true,
          originalFile,
          originalSha256: sha256Hex(target.originalBytes!),
          injectedEntries: (target.injectedEntries ?? []).map((e) => ({
            command: e.command,
            args: [...e.args],
          })),
        };
      }
      return {
        sourcePath: target.sourcePath,
        ...(target.writePath !== undefined ? { writePath: target.writePath } : {}),
        ...(target.symlinkTarget !== undefined
          ? { symlinkTarget: target.symlinkTarget }
          : {}),
        beforeSha256: target.beforeSha256,
        desiredSha256,
        desiredFile,
        ...originalFields,
      };
    });
    const plan: EjectJournalPlan = {
      version: 1,
      client: clientId,
      boundary,
      targets: journalTargets,
    };
    atomicWriteFileSync(
      path.join(staging, "plan.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
      PRIVATE_FILE,
    );
    fsyncDirectory(staging);
    fs.renameSync(staging, destination);
    fsyncDirectory(root);
    return { dir: destination, plan };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

export function readDesiredBytes(
  journal: LoadedEjectJournal,
  target: EjectJournalTarget,
): Buffer {
  return readJournalFile(journal, target.desiredFile, target.desiredSha256);
}

/** Pre-sync original bytes for a key-level target, used to re-derive its merge
 *  from the current (possibly third-state) file on resume (NEW-3). */
export function readOriginalBytes(
  journal: LoadedEjectJournal,
  target: EjectJournalTarget,
): Buffer {
  if (!target.originalFile || !target.originalSha256) {
    throw new Error("pending eject target has no original bytes to re-derive from");
  }
  return readJournalFile(journal, target.originalFile, target.originalSha256);
}

function readJournalFile(journal: LoadedEjectJournal, file: string, expectedSha: string): Buffer {
  const resolved = path.resolve(path.join(journal.dir, file));
  if (path.dirname(resolved) !== path.resolve(journal.dir)) {
    throw new Error("pending eject journal file path escapes its journal");
  }
  const bytes = readRegularFileNoFollow(resolved);
  if (sha256Hex(bytes) !== expectedSha) {
    throw new Error("pending eject journal bytes do not match their recorded hash");
  }
  return bytes;
}

export function clearEjectJournal(journal: LoadedEjectJournal): void {
  fs.rmSync(journal.dir, { recursive: true });
  fsyncDirectory(path.dirname(journal.dir));
}
