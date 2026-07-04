#!/usr/bin/env node
import { ejectClient } from "./eject.js";
import { init } from "./init.js";
import { discoverClients } from "./clients.js";
import { buildReceipt, renderReceipt } from "./receipt.js";
import { serve } from "./serve.js";
import { syncClient, WRITE_CLIENTS } from "./sync.js";
import { telemetry } from "./telemetry.js";
import { scanSkillSources, trustScan } from "@rosterhq/playbook";
import { loadConfig } from "./rosterfile.js";
import type { ClientId } from "./clients.js";

const HELP = `roster — the tool router for AI agents

  roster init                 discover client configs, import servers, print the Day-0 receipt
  roster receipt              re-print the receipt from current configs
  roster sync [--client id]   swap write-clients (${WRITE_CLIENTS.join(", ")}) to a single Roster entry (backs up originals)
  roster eject [--client id] [--force]
                              restore original configs byte-for-byte from backup
  roster serve [--five|--transparent]
                              run the router over stdio (default mode: transparent)
  roster telemetry [status|on|off]
                              local-first, OFF by default; no endpoint exists yet
`;

async function main(): Promise<number> {
  const [, , command, ...rest] = process.argv;
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const flagValue = (name: string): string | undefined => {
    const idx = rest.indexOf(name);
    return idx >= 0 ? rest[idx + 1] : undefined;
  };

  switch (command) {
    case "init":
      init();
      return 0;

    case "receipt": {
      const discoveries = discoverClients();
      const config = loadConfig();
      const skills = scanSkillSources(config.skillSources);
      const review = skills.filter((s) => trustScan(s).status === "review").length;
      process.stdout.write(`${renderReceipt(buildReceipt(discoveries, skills, review))}\n`);
      return 0;
    }

    case "sync": {
      const only = flagValue("--client") as ClientId | undefined;
      const targets = only ? [only] : WRITE_CLIENTS;
      for (const client of targets) {
        const result = syncClient(client);
        if (result.action === "synced") {
          process.stdout.write(`synced   ${client}  (${result.configPath}; backup: ${result.backupDir})\n`);
        } else if (result.action === "already-synced") {
          process.stdout.write(`ok       ${client}  already points at Roster\n`);
        } else {
          process.stdout.write(`skipped  ${client}  no config found\n`);
        }
      }
      return 0;
    }

    case "eject": {
      const only = flagValue("--client") as ClientId | undefined;
      const targets = only ? [only] : WRITE_CLIENTS;
      let failures = 0;
      for (const client of targets) {
        const result = ejectClient(client, { force: flags.has("--force") });
        if (result.action === "restored") {
          process.stdout.write(`restored ${client}  ${result.configPath}${result.detail ? `  ${result.detail}` : ""}\n`);
        } else if (result.action === "no-backup") {
          process.stdout.write(`skipped  ${client}  no backup recorded\n`);
        } else {
          failures++;
          process.stdout.write(`REFUSED  ${client}  ${result.detail}\n`);
        }
      }
      return failures > 0 ? 1 : 0;
    }

    case "serve":
      await serve(flags.has("--five") ? "five" : flags.has("--transparent") ? "transparent" : undefined);
      return -1; // long-running; keep the process alive on the transport

    case "combine": {
      const [sub, suitePath] = rest.filter((a) => !a.startsWith("--"));
      const dashDash = process.argv.indexOf("--");
      const serverCmd = dashDash >= 0 ? process.argv.slice(dashDash + 1) : [];
      if (sub !== "run" || !suitePath || serverCmd.length === 0) {
        process.stdout.write(
          "usage: roster combine run <suite.yaml> --name <server-name> -- <command> [args…]\n" +
            "       ({{sandbox}} in args is replaced with each task's sandbox dir)\n",
        );
        return 1;
      }
      const { parseSuite, runSuite, buildLabResults } = await import("@rosterhq/combine");
      const fs = await import("node:fs");
      const suite = parseSuite(fs.readFileSync(suitePath, "utf8"));
      const name = flagValue("--name") ?? "server-under-test";
      const run = await runSuite(suite, {
        name,
        command: serverCmd[0]!,
        args: serverCmd.slice(1),
      });
      const lab = buildLabResults([run]);
      const outPath = flagValue("--out") ?? "lab-results.json";
      fs.writeFileSync(outPath, `${JSON.stringify(lab, null, 2)}\n`);
      const summary = lab.runs[0]!.summary;
      for (const r of run.results) {
        process.stdout.write(`${r.pass ? "PASS" : "FAIL"}  ${r.taskId}${r.detail ? `  (${r.stage}: ${r.detail})` : ""}\n`);
      }
      process.stdout.write(
        `\n${name}: ${summary.passes}/${summary.n} passed · Wilson LB ${summary.wilsonLb.toFixed(3)} · signed ${summary.signedN} (unsigned results never feed named scores)\n→ ${outPath}\n`,
      );
      return summary.passes === summary.n ? 0 : 1;
    }

    case "telemetry": {
      const action = (rest[0] ?? "status") as "status" | "on" | "off";
      telemetry(["status", "on", "off"].includes(action) ? action : "status");
      return 0;
    }

    default:
      process.stdout.write(HELP);
      return command === undefined || command === "help" || command === "--help" ? 0 : 1;
  }
}

main().then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (err) => {
    process.stderr.write(`roster: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  },
);
