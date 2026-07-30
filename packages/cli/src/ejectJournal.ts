import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "@rosterhq/coach";
import type { ClientId } from "./clients.js";
import { atomicWriteFileSync, PRIVATE_DIR, PRIVATE_FILE } from "./rosterfile.js";
import { rosterHome } from "./paths.js";

export interface EjectJournalTarget {
  sourcePath: string;
  writePath?: string;
  symlinkTarget?: string;
  beforeSha256: string | null;
  desiredSha256: string;
  desiredFile: string;
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
    parsed = JSON.parse(fs.readFileSync(path.join(dir, "plan.json"), "utf8"));
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
      return {
        sourcePath: target.sourcePath,
        ...(target.writePath !== undefined ? { writePath: target.writePath } : {}),
        ...(target.symlinkTarget !== undefined
          ? { symlinkTarget: target.symlinkTarget }
          : {}),
        beforeSha256: target.beforeSha256,
        desiredSha256,
        desiredFile,
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
  const desiredPath = path.join(journal.dir, target.desiredFile);
  const resolved = path.resolve(desiredPath);
  if (path.dirname(resolved) !== path.resolve(journal.dir)) {
    throw new Error("pending eject desired-file path escapes its journal");
  }
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("pending eject desired bytes are not a regular file");
  }
  const bytes = fs.readFileSync(resolved);
  if (sha256Hex(bytes) !== target.desiredSha256) {
    throw new Error("pending eject desired bytes do not match their recorded hash");
  }
  return bytes;
}

export function clearEjectJournal(journal: LoadedEjectJournal): void {
  fs.rmSync(journal.dir, { recursive: true });
  fsyncDirectory(path.dirname(journal.dir));
}
