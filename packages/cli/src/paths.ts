import os from "node:os";
import path from "node:path";

/** Test hook: ROSTER_TEST_HOME lets the whole CLI run against a fixture home. */
export function homeDir(): string {
  return process.env.ROSTER_TEST_HOME ?? os.homedir();
}

export function rosterHome(): string {
  return process.env.ROSTER_HOME ?? path.join(homeDir(), ".roster");
}

export function backupsDir(): string {
  return path.join(rosterHome(), "backups");
}

export function rosterConfigPath(): string {
  return path.join(rosterHome(), "roster.json");
}

export function receiptPath(): string {
  return path.join(rosterHome(), "receipt.json");
}

export function coachDbPath(): string {
  return path.join(rosterHome(), "coach.db");
}
