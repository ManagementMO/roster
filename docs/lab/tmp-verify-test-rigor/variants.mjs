// Three faithful variants of the config atomic-write, to test what the shipped
// cli.test suite can and cannot distinguish.
import crypto from "node:crypto";
import fs from "node:fs";

// SHIPPED FIX (rosterfile.ts:16): private pid+random tmp + rename + rmSync cleanup on failure.
export function current(target, data) {
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw err;
  }
}

// REGRESSION the finding names: back to the shared `${target}.tmp` name.
// (Cleanup kept identical, so this isolates the *tmp-name* variable for the concurrency test.)
export function sharedTmp(target, data) {
  const tmp = `${target}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw err;
  }
}

// REGRESSION the finding names: private tmp but the rmSync-on-failure cleanup removed.
// (Name kept private, so this isolates the *cleanup* variable for the failure-path test.)
export function noCleanup(target, data) {
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, target);
}

export const VARIANTS = { current, sharedTmp, noCleanup };
