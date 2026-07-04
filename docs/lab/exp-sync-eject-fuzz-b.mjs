/**
 * EXP B — sequence fuzz over sync/eject/edit/delete on real files.
 * 30 seeded random sequences x 14 ops across the 4 write clients.
 * Invariants checked after EVERY step:
 *   I1 user's own servers never lost (config ∪ roster.json), forced ejects excused
 *   I2 every backup on disk is sufficient (original present + sha matches manifest)
 *   I3 latest pointer == max manifest timestamp
 *   I4 era archived after every successful eject
 *   I5 every "restored" returns EXACTLY the era-pristine bytes (Buffer equality)
 * Plus: targeted same-millisecond double-sync probe (backup dir collision).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  cli, syncClient, ejectClient, CLIENTS, configPathFor, freshHome,
  writeConfig, firstDiff, listBackupDirs, backupsRoot, rng, saveSection, SCRATCH,
} from "./exp-sync-eject-fuzz-lib.mjs";
import { createRequire } from "node:module";
import { repo } from "./exp-sync-eject-fuzz-lib.mjs";
const { parse: parseToml, stringify: stringifyToml } = createRequire(
  path.join(repo, "packages/cli/package.json"),
)("smol-toml");

process.chdir(SCRATCH);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const WRITE = ["claude-code", "cursor", "codex", "openclaw"];

const SEED_CONFIGS = {
  "claude-code": `{\n  "numStartups": 42,\n  "mcpServers": {\n    "memory": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"]}\n  },\n  "tipsHistory": {"a": 1}\n}\n`,
  "cursor": `{\n  // cursor servers\n  "mcpServers": {\n    "fs": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]},\n  },\n}\n`,
  "codex": `# codex\nmodel = "o4"\n\n[mcp_servers.search]\ncommand = "npx"\nargs = ["-y", "srv-search"]\n`,
  "openclaw": `{"mcpServers":{"web":{"url":"https://mcp.example.com/sse"}}}`,
};

function identityOf(s) {
  return JSON.stringify({ command: s.command ?? null, args: s.args ?? [], url: s.url ?? null, env: s.env ?? {} });
}

function parseServers(clientId, bytes, cfgPath) {
  const spec = CLIENTS.find((c) => c.id === clientId);
  try { return spec.parse(bytes.toString("utf8"), cfgPath); } catch { return null; }
}

function rosterIdentities(home) {
  const p = path.join(home, ".roster", "roster.json");
  if (!fs.existsSync(p)) return new Set();
  try {
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    return new Set(Object.values(cfg.servers ?? {}).map((s) => identityOf(s)));
  } catch { return new Set(); }
}

/** user edit: add a server via format-aware parse-modify-stringify */
function editAdd(clientId, cfgPath, n) {
  const cur = fs.readFileSync(cfgPath, "utf8");
  const name = `user-srv-${n}`;
  const server = { command: "node", args: [`user-${n}.js`], env: { N: String(n) } };
  if (clientId === "codex") {
    const data = parseToml(cur);
    data.mcp_servers = data.mcp_servers && typeof data.mcp_servers === "object" ? data.mcp_servers : {};
    data.mcp_servers[name] = server;
    fs.writeFileSync(cfgPath, `${stringifyToml(data)}\n`);
  } else {
    const data = cli.parseJsonc(cur);
    data.mcpServers = data.mcpServers && typeof data.mcpServers === "object" && !Array.isArray(data.mcpServers) ? data.mcpServers : {};
    data.mcpServers[name] = server;
    fs.writeFileSync(cfgPath, `${JSON.stringify(data, null, 2)}\n`);
  }
  return { name, identity: identityOf(server) };
}

function editUnrelated(clientId, cfgPath, n) {
  const cur = fs.readFileSync(cfgPath, "utf8");
  if (clientId === "codex") fs.writeFileSync(cfgPath, `${cur}${cur.endsWith("\n") ? "" : "\n"}# user note ${n}\n`);
  else {
    const data = cli.parseJsonc(cur);
    if (data && typeof data === "object" && !Array.isArray(data)) { data[`userNote${n}`] = n; fs.writeFileSync(cfgPath, `${JSON.stringify(data, null, 2)}\n`); }
    else fs.writeFileSync(cfgPath, cur); // scalar/array top: touch
  }
}

function checkInvariants(home, clientId, model, violations, stepTag) {
  const cfgPath = configPathFor(clientId, home);
  const cfgBytes = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath) : null;
  // I2 backup sufficiency + I3 latest pointer
  const root = backupsRoot(home, clientId);
  if (fs.existsSync(root)) {
    const dirs = fs.readdirSync(root).filter((e) => fs.statSync(path.join(root, e)).isDirectory());
    let maxTs = null;
    for (const d of dirs) {
      const mPath = path.join(root, d, "manifest.json");
      const oPath = path.join(root, d, "original");
      if (!fs.existsSync(mPath)) { violations.push({ inv: "I2", stepTag, client: clientId, detail: `backup dir ${d} missing manifest` }); continue; }
      const m = JSON.parse(fs.readFileSync(mPath, "utf8"));
      if (!fs.existsSync(oPath)) { violations.push({ inv: "I2", stepTag, client: clientId, detail: `backup ${d} missing original` }); continue; }
      if (sha(fs.readFileSync(oPath)) !== m.originalSha256) violations.push({ inv: "I2", stepTag, client: clientId, detail: `backup ${d} sha mismatch` });
      if (maxTs === null || m.timestamp > maxTs) maxTs = m.timestamp;
    }
    const latestPath = path.join(root, "latest");
    if (dirs.length > 0) {
      if (!fs.existsSync(latestPath)) violations.push({ inv: "I3", stepTag, client: clientId, detail: "latest pointer missing" });
      else {
        const latest = fs.readFileSync(latestPath, "utf8");
        if (latest !== maxTs) violations.push({ inv: "I3", stepTag, client: clientId, detail: `latest=${latest} != maxTs=${maxTs}` });
      }
    }
  }
  // I1 server preservation
  const inRoster = rosterIdentities(home);
  const inConfig = new Set();
  if (cfgBytes) {
    const servers = parseServers(clientId, cfgBytes, cfgPath);
    if (servers) for (const s of servers) inConfig.add(identityOf(s));
  }
  for (const [name, identity] of model.userServers.get(clientId) ?? []) {
    if (!inRoster.has(identity) && !inConfig.has(identity)) {
      violations.push({ inv: "I1", stepTag, client: clientId, detail: `user server ${name} lost (not in roster.json nor config)` });
    }
  }
}

// ---------------- fuzz loop ----------------
const allViolations = [];
const observations = []; // non-violation notable events (throws, refusals)
let opCount = 0;

for (let seq = 1; seq <= 30; seq++) {
  const rand = rng(1000 + seq);
  const home = freshHome(`b-seq${seq}`);
  const model = {
    userServers: new Map(WRITE.map((c) => [c, []])), // [name, identity][]
    eraPristine: new Map(), // client -> Buffer (bytes at first synced of current era)
    lastAction: [],
  };
  // seed configs + register their servers as user servers
  for (const c of WRITE) {
    const p = writeConfig(c, home, Buffer.from(SEED_CONFIGS[c]));
    const servers = parseServers(c, Buffer.from(SEED_CONFIGS[c]), p);
    for (const s of servers ?? []) model.userServers.get(c).push([s.name, identityOf(s)]);
  }
  let editCounter = 0;
  let simTime = Date.parse("2026-07-04T10:00:00Z") + seq * 1e7;

  for (let step = 0; step < 14; step++) {
    const r = rand();
    const client = WRITE[Math.floor(rand() * 4)];
    const cfgPath = configPathFor(client, home);
    const stepTag = `seq${seq}#${step}`;
    let op;
    try {
      if (r < 0.30) {
        op = `SYNC(${client})`;
        simTime += 1500 + Math.floor(rand() * 5000);
        const res = syncClient(client, new Date(simTime));
        if (res.action === "synced" && !model.eraPristine.has(client)) {
          // first synced of this era: pristine = bytes recorded in the oldest backup
          const root = backupsRoot(home, client);
          const dirs = fs.readdirSync(root).filter((e) => fs.statSync(path.join(root, e)).isDirectory()).sort();
          model.eraPristine.set(client, fs.readFileSync(path.join(root, dirs[0], "original")));
        }
        op += `->${res.action}`;
      } else if (r < 0.50) {
        if (!fs.existsSync(cfgPath)) { op = `EDIT_ADD(${client})->skip-missing`; }
        else {
          const added = editAdd(client, cfgPath, ++editCounter);
          model.userServers.get(client).push([added.name, added.identity]);
          op = `EDIT_ADD(${client},${added.name})`;
        }
      } else if (r < 0.60) {
        if (fs.existsSync(cfgPath)) { editUnrelated(client, cfgPath, ++editCounter); op = `EDIT_UNRELATED(${client})`; }
        else op = `EDIT_UNRELATED(${client})->skip-missing`;
      } else if (r < 0.65) {
        if (fs.existsSync(cfgPath)) { fs.writeFileSync(cfgPath, fs.readFileSync(cfgPath)); op = `EDIT_TOUCH(${client})`; }
        else op = `EDIT_TOUCH(${client})->skip-missing`;
      } else if (r < 0.85) {
        const force = rand() < 0.25;
        op = `EJECT(${client}${force ? ",force" : ""})`;
        const pre = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath) : null;
        const res = ejectClient(client, { force });
        op += `->${res.action}`;
        if (res.action === "restored") {
          const restored = fs.readFileSync(cfgPath);
          const pristine = model.eraPristine.get(client);
          if (!pristine) {
            allViolations.push({ inv: "I5", stepTag, client, detail: "restored but harness saw no era pristine (restore from unknown era)" });
          } else {
            const diff = firstDiff(pristine, restored);
            if (diff) allViolations.push({ inv: "I5", stepTag, client, detail: `restored bytes != era pristine`, diff });
          }
          if (fs.existsSync(backupsRoot(home, client))) allViolations.push({ inv: "I4", stepTag, client, detail: "backups dir not archived after restore" });
          model.eraPristine.delete(client);
          if (force && pre) {
            // forced eject may legitimately clobber un-imported user edits: excuse them
            const inRosterNow = rosterIdentities(home);
            const keep = model.userServers.get(client).filter(([name, id]) => {
              const stillFindable = inRosterNow.has(id) || (parseServers(client, fs.readFileSync(cfgPath), cfgPath) ?? []).some((s) => identityOf(s) === id);
              if (!stillFindable) observations.push({ stepTag, note: `forced eject clobbered un-synced user server ${name} (documented --force semantics)` });
              return stillFindable;
            });
            model.userServers.set(client, keep);
          }
        } else if (res.action === "refused-modified" || res.action === "missing-file") {
          observations.push({ stepTag, note: `${op} (${(res.detail ?? "").slice(0, 60)})` });
        }
      } else if (r < 0.90) {
        if (fs.existsSync(cfgPath)) {
          fs.rmSync(cfgPath);
          op = `DELETE_CONFIG(${client})`;
          // The user destroyed their own config. Any server in it that roster
          // never imported was never roster's responsibility — stop tracking it.
          // (A server that IS in roster.json must STAY findable — still checked.)
          const inRosterNow = rosterIdentities(home);
          const kept = model.userServers.get(client).filter(([name, id]) => {
            if (!inRosterNow.has(id)) {
              observations.push({ stepTag, note: `user deleted own config containing never-imported server ${name} (user action, excused)` });
              return false;
            }
            return true;
          });
          model.userServers.set(client, kept);
        }
        else op = `DELETE_CONFIG(${client})->skip-missing`;
      } else if (r < 0.95) {
        op = "SYNC_ALL";
        for (const c of WRITE) {
          simTime += 3 + Math.floor(rand() * 20);
          try {
            const res = syncClient(c, new Date(simTime));
            if (res.action === "synced" && !model.eraPristine.has(c)) {
              const root = backupsRoot(home, c);
              const dirs = fs.readdirSync(root).filter((e) => fs.statSync(path.join(root, e)).isDirectory()).sort();
              model.eraPristine.set(c, fs.readFileSync(path.join(root, dirs[0], "original")));
            }
          } catch (e) { observations.push({ stepTag, note: `SYNC_ALL ${c} THREW: ${String(e.message).slice(0, 80)}` }); }
        }
      } else {
        op = "EJECT_ALL";
        for (const c of WRITE) {
          const res = ejectClient(c, {});
          if (res.action === "restored") {
            const restored = fs.readFileSync(configPathFor(c, home));
            const pristine = model.eraPristine.get(c);
            if (pristine) { const d = firstDiff(pristine, restored); if (d) allViolations.push({ inv: "I5", stepTag, client: c, detail: "EJECT_ALL restored != pristine", diff: d }); }
            model.eraPristine.delete(c);
          }
        }
      }
    } catch (err) {
      op = `${op ?? "OP"}->THREW: ${String(err && err.message || err).slice(0, 100)}`;
      observations.push({ stepTag, note: op });
    }
    opCount++;
    for (const c of WRITE) checkInvariants(home, c, model, allViolations, `${stepTag} after ${op}`);
  }
}

console.log(`\n== EXP B: 30 sequences x 14 steps = ${opCount} ops ==`);
console.log(`violations: ${allViolations.length}`);
for (const v of allViolations.slice(0, 20)) console.log(` ${v.inv} ${v.stepTag} ${v.client ?? ""}: ${v.detail}${v.diff ? ` @${v.diff.offset}` : ""}`);
console.log(`notable observations: ${observations.length} (first 12)`);
for (const o of observations.slice(0, 12)) console.log(`  ${o.stepTag}: ${o.note}`);

// ---------------- targeted same-ms double-sync collision ----------------
console.log(`\n== same-millisecond double-sync probe ==`);
const home = freshHome("b-same-ms");
const C0 = Buffer.from(SEED_CONFIGS["claude-code"]);
const cfgPath = writeConfig("claude-code", home, C0);
const T = new Date("2026-07-04T12:00:00.000Z");
const r1 = syncClient("claude-code", T);
const afterSync1 = fs.readFileSync(cfgPath);
// user edits between the two same-ms syncs
const added = editAdd("claude-code", cfgPath, 999);
const C1 = fs.readFileSync(cfgPath);
const r2 = syncClient("claude-code", T); // SAME timestamp -> same backup dir
const backupDirs = listBackupDirs(home, "claude-code");
const origInBackup = fs.readFileSync(path.join(backupsRoot(home, "claude-code"), backupDirs[0], "original"));
const pristineDestroyed = !origInBackup.equals(C0);
const ej = ejectClient("claude-code", {});
const finalBytes = fs.readFileSync(cfgPath);
const collision = {
  sync1: r1.action, sync2: r2.action, backupDirCount: backupDirs.length,
  pristineDestroyed,
  backupOriginalNow: pristineDestroyed ? "C1 (post-edit state, NOT pristine)" : "C0 (pristine intact)",
  eject: ej.action,
  finalEqualsC0: finalBytes.equals(C0),
  finalEqualsC1: finalBytes.equals(C1),
  diffVsC0: firstDiff(C0, finalBytes),
};
console.log(JSON.stringify(collision, null, 2));

saveSection("b", { opCount, violations: allViolations, observations, sameMsCollision: collision });
