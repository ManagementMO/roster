/**
 * The whole delivery, in order.
 *
 * audio → preview → contact sheet → before/after → master → poster → teaser →
 * gif → probe → QA sheet.
 *
 * The QA sheet runs LAST because it prints the master's measured specification,
 * which only exists after `probe` has parsed the file.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STEPS = [
  ["audio", ["run", "audio"]],
  ["preview", ["run", "preview"]],
  ["contact-sheet", ["run", "contact-sheet"]],
  ["before-after", ["run", "before-after"]],
  ["master", ["run", "master"]],
  ["poster", ["run", "poster"]],
  ["teaser", ["run", "teaser"]],
  ["gif", ["run", "gif"]],
  ["probe", ["run", "probe"]],
  ["qa-sheet", ["run", "qa-sheet"]],
];

const only = process.argv.slice(2);
let failures = 0;

for (const [name, args] of STEPS) {
  if (only.length > 0 && !only.includes(name)) continue;
  const started = Date.now();
  process.stdout.write(`\n──── ${name} ────\n`);
  const res = spawnSync("pnpm", args, { cwd: ROOT, stdio: "inherit" });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (res.status !== 0) {
    failures++;
    process.stderr.write(`build  FAIL  ${name} (${secs}s)\n`);
  } else {
    process.stdout.write(`build  ok    ${name} (${secs}s)\n`);
  }
}

process.stdout.write(`\nbuild  ${failures === 0 ? "all steps succeeded" : `${failures} step(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
