// Child process: hammer one shared target with `writes` config writes of
// varying length, using the named variant. Emits a JSON tally as its last line.
import fs from "node:fs";
import { VARIANTS } from "./variants.mjs";

const cfg = JSON.parse(process.argv[2]);
const { target, variant, writes, goFile } = cfg;
const write = VARIANTS[variant];

// Barrier: all workers start at once so their writes actually overlap.
const spinUntilGo = () => {
  const deadline = Date.now() + 10000;
  while (!fs.existsSync(goFile) && Date.now() < deadline) {
    // busy-wait keeps the overlap window tight
  }
};
spinUntilGo();

const errorCounts = {};
let ok = 0;
let failed = 0;
for (let i = 0; i < writes; i++) {
  // Distinct, varying-length pretty JSON: a partial/interleaved write is invalid JSON.
  const pad = "x".repeat(50 + ((i * 137 + cfg.workerId * 991) % 6000));
  const data = `${JSON.stringify({ version: 1, worker: cfg.workerId, seq: i, pad }, null, 2)}\n`;
  try {
    write(target, data);
    ok++;
  } catch (err) {
    failed++;
    const code = err.code || err.message.slice(0, 30);
    errorCounts[code] = (errorCounts[code] || 0) + 1;
  }
}
process.stdout.write(`${JSON.stringify({ workerId: cfg.workerId, ok, failed, errorCounts })}\n`);
