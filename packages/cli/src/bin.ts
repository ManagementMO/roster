#!/usr/bin/env node
import {
  DENSE_APPROX_MB,
  denseOffer,
  denseStatusLine,
  installDenseRuntime,
  isDenseAvailable,
} from "./dense.js";
import { ejectClient } from "./eject.js";
import { init } from "./init.js";
import { discoverClients } from "./clients.js";
import { buildReceipt, renderReceipt, saveReceipt } from "./receipt.js";
import { serve } from "./serve.js";
import { syncClient, WRITE_CLIENTS } from "./sync.js";
import { telemetry } from "./telemetry.js";
import { scanSkillSources, trustScan } from "@roster/playbook";
import { loadConfig } from "./rosterfile.js";
import type { ClientId } from "./clients.js";

const HELP = `roster — the tool router for AI agents

  roster init                 discover client configs, import servers, print the Day-0 receipt
  roster receipt              re-print the receipt from current configs
  roster sync [--client id]   swap write-clients (${WRITE_CLIENTS.join(", ")}) to a single Roster entry (backs up originals)
  roster eject [--client id] [--force]
                              restore configs as found (byte-for-byte for dedicated files;
                              key-level for live state files — post-sync changes preserved)
  roster serve [--five|--transparent]
                              run the router over stdio (default mode: transparent)
  roster unquarantine <id>    clear a drift-quarantined capability so it can be drafted again
  roster combine run <suite.yaml> --name <server> -- <command> [args…]
                              probe a server against a Combine suite → lab-results.json
  roster dense [status|enable]
                              optional semantic search (~385 MB, local only); lexical works without it
  roster telemetry [status|on|off]
                              local-first, OFF by default; no endpoint exists yet

  init flags: --dense installs the embedding runtime without asking, --no-dense skips the question
`;

/**
 * Ask once, after `init`, whether to add the optional embedding runtime.
 *
 * Rules that matter more than the prompt itself:
 *  - a non-interactive run (CI, a piped installer, an agent) is NEVER blocked:
 *    no TTY means no question, just a one-line hint. A CLI that hangs waiting
 *    for stdin during `npx` would be worse than any download size.
 *  - `--dense` / `--no-dense` make the choice explicit for scripts.
 *  - declining is free and repeatable: `roster dense enable` later does the same
 *    thing, and Roster is fully functional either way.
 */
async function offerDenseRuntime(flags: Set<string>): Promise<void> {
  if (flags.has("--no-dense") || isDenseAvailable()) return;

  const wanted =
    flags.has("--dense") ||
    (process.stdin.isTTY === true && process.stdout.isTTY === true && (await askYesNo()));

  if (!wanted) {
    if (!flags.has("--dense")) {
      process.stdout.write(
        `\nSemantic search is off (lexical only). Enable anytime: \`roster dense enable\` (~${DENSE_APPROX_MB} MB, local only).\n`,
      );
    }
    return;
  }
  process.stdout.write(`\ninstalling the embedding runtime (~${DENSE_APPROX_MB} MB)…\n`);
  const result = installDenseRuntime();
  process.stdout.write(
    result.ok
      ? "semantic search enabled — it warms up in the background on first use.\n"
      : `could not install the embedding runtime: ${result.detail}\n  Roster keeps working in lexical mode; retry with \`roster dense enable\`.\n`,
  );
}

async function askYesNo(): Promise<boolean> {
  process.stdout.write(denseOffer());
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Install it now? [y/N] ");
    return /^y(es)?$/i.test(answer.trim());
  } catch {
    // Ctrl+D (EOF) or Ctrl+C at the prompt is a decline, not a crash. Anything
    // that ends the question without a "yes" leaves Roster exactly as it is.
    process.stdout.write("\n");
    return false;
  } finally {
    rl.close();
  }
}

function assertWriteClient(id: string | undefined): ClientId | undefined {
  if (id === undefined) return undefined;
  if (!(WRITE_CLIENTS as string[]).includes(id)) {
    throw new Error(`unknown --client "${id}" (write clients: ${WRITE_CLIENTS.join(", ")})`);
  }
  return id as ClientId;
}

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
      await offerDenseRuntime(flags);
      return 0;

    case "dense": {
      const sub = rest.find((a) => !a.startsWith("--")) ?? "status";
      if (sub === "status") {
        process.stdout.write(`${denseStatusLine()}\n`);
        return 0;
      }
      if (sub !== "enable") {
        process.stdout.write("usage: roster dense [status|enable]\n");
        return 1;
      }
      if (isDenseAvailable()) {
        process.stdout.write("semantic search is already enabled\n");
        return 0;
      }
      process.stdout.write(`installing the embedding runtime (~${DENSE_APPROX_MB} MB)…\n`);
      const result = installDenseRuntime();
      process.stdout.write(
        result.ok
          ? `semantic search enabled → ${result.detail}\n`
          : `could not install the embedding runtime: ${result.detail}\n`,
      );
      return result.ok ? 0 : 1;
    }

    case "receipt": {
      const discoveries = discoverClients();
      const config = loadConfig();
      const skills = scanSkillSources(config.skillSources);
      const review = skills.filter((s) => trustScan(s).status === "review").length;
      const receipt = buildReceipt(discoveries, skills, review);
      saveReceipt(receipt); // spec §6.3: "re-print/update the audit"
      process.stdout.write(`${renderReceipt(receipt)}\n`);
      return 0;
    }

    case "sync": {
      const only = assertWriteClient(flagValue("--client"));
      const targets = only ? [only] : WRITE_CLIENTS;
      let syncFailures = 0;
      for (const client of targets) {
        // Per-client isolation: one malformed/BOM'd config must not abort the
        // whole fleet and leave the rest unsynced with an anonymous error (D2).
        try {
          const result = syncClient(client);
          if (result.action === "synced") {
            process.stdout.write(`synced   ${client}  (${result.configPath}; backup: ${result.backupDir})\n`);
          } else if (result.action === "already-synced") {
            process.stdout.write(`ok       ${client}  already points at Roster\n`);
          } else {
            process.stdout.write(`skipped  ${client}  no config found\n`);
          }
        } catch (err) {
          syncFailures++;
          process.stderr.write(`error    ${client}  ${err instanceof Error ? err.message : String(err)}\n`);
        }
      }
      return syncFailures > 0 ? 1 : 0;
    }

    case "eject": {
      const only = assertWriteClient(flagValue("--client"));
      const targets = only ? [only] : WRITE_CLIENTS;
      let failures = 0;
      let restored = 0;
      for (const client of targets) {
        // Same per-client isolation as the sync loop (D2): one client's bad
        // state must not abort the other restores.
        try {
          const result = ejectClient(client, { force: flags.has("--force") });
          if (result.action === "restored") {
            restored++;
            process.stdout.write(`restored ${client}  ${result.configPath}${result.detail ? `  ${result.detail}` : ""}\n`);
          } else if (result.action === "no-backup") {
            process.stdout.write(`skipped  ${client}  ${result.detail ?? "no backup recorded"}\n`);
          } else {
            failures++;
            process.stdout.write(`REFUSED  ${client}  ${result.detail}\n`);
          }
        } catch (err) {
          failures++;
          process.stderr.write(`error    ${client}  ${err instanceof Error ? err.message : String(err)}\n`);
        }
      }
      if (targets.length > 1) process.stdout.write(`\n${restored} restored, ${failures} refused\n`);
      return failures > 0 ? 1 : 0;
    }

    case "unquarantine": {
      const id = rest.find((a) => !a.startsWith("--"));
      if (!id) {
        process.stdout.write("usage: roster unquarantine <capability-id>\n");
        return 1;
      }
      const { CoachStore, openCoachDb } = await import("@roster/coach");
      const { coachDbPath } = await import("./paths.js");
      const store = new CoachStore(openCoachDb(coachDbPath()));
      store.clearQuarantine(id);
      process.stdout.write(`cleared quarantine for ${id} (it can be drafted again)\n`);
      return 0;
    }

    case "serve":
      await serve(flags.has("--five") ? "five" : flags.has("--transparent") ? "transparent" : undefined);
      return -1; // long-running; keep the process alive on the transport

    case "combine": {
      // Everything after `--` is the server command; flags/positionals live before it.
      const dashDash = process.argv.indexOf("--");
      const pre = dashDash >= 0 ? process.argv.slice(3, dashDash) : process.argv.slice(3);
      const serverCmd = dashDash >= 0 ? process.argv.slice(dashDash + 1) : [];
      const positionals: string[] = [];
      for (let i = 0; i < pre.length; i++) {
        const a = pre[i]!;
        if (a.startsWith("--")) {
          i++; // skip the flag's value
          continue;
        }
        positionals.push(a);
      }
      const [sub, suitePath] = positionals;
      const preFlag = (name: string): string | undefined => {
        const idx = pre.indexOf(name);
        return idx >= 0 ? pre[idx + 1] : undefined;
      };
      if (sub !== "run" || !suitePath || serverCmd.length === 0) {
        process.stdout.write(
          "usage: roster combine run <suite.yaml> --name <server-name> -- <command> [args…]\n" +
            "       ({{sandbox}} in args is replaced with each task's sandbox dir)\n",
        );
        return 1;
      }
      const { parseSuite, runSuite, buildLabResults } = await import("@roster/combine");
      const fs = await import("node:fs");
      const suite = parseSuite(fs.readFileSync(suitePath, "utf8"));
      const name = preFlag("--name") ?? "server-under-test";
      const run = await runSuite(suite, {
        name,
        command: serverCmd[0]!,
        args: serverCmd.slice(1),
      });
      const lab = buildLabResults([run]);
      const outPath = preFlag("--out") ?? "lab-results.json";
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
      const action = rest[0] ?? "status";
      if (!["status", "on", "off"].includes(action)) {
        process.stderr.write(`roster: unknown telemetry action "${action}" (use status|on|off)\n`);
        return 1;
      }
      telemetry(action as "status" | "on" | "off");
      return 0;
    }

    default:
      if (command !== undefined && command !== "help" && command !== "--help") {
        process.stderr.write(`roster: unknown command "${command}"\n\n`);
        process.stdout.write(HELP);
        return 1;
      }
      process.stdout.write(HELP);
      return 0;
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
