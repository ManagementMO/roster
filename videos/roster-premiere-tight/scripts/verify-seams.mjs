import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = spawnSync("npx", ["--yes", "hyperframes@0.8.31", "preview", "--background", "--no-open"], {
  cwd: project, encoding: "utf8", maxBuffer: 2e6,
});
if (server.status !== 0) throw new Error(server.stderr || server.stdout);
const output = (server.stdout + server.stderr).replace(/\x1b\[[0-9;]*m/g, "");
const base = output.match(/Server\s+(https?:\/\/\S+)/)?.[1];
if (!base) throw new Error("Preview did not return its actual server URL");
const response = await fetch(`${base}/api/projects`);
if (!response.ok) throw new Error(`Project inventory returned ${response.status}`);
const { projects } = await response.json();
const current = projects.find((candidate) => resolve(candidate.dir) === project);
if (!current) throw new Error("The preview server does not contain this exact project directory");

// Resolve the real daemon and exact project; never assume the CLI honored a random port.
const verified = spawnSync(process.execPath, [
  "scripts/seam-gate.mjs", "verify", "--ledger", "ledger.json",
  "--url", base, "--comp-url", `${base}/api/projects/${encodeURIComponent(current.id)}/preview/comp/index.html`,
  "--fps", "120", ...process.argv.slice(2),
], { cwd: project, stdio: "inherit" });
process.exit(verified.status ?? 1);
