import fs from "node:fs";
import { trustScan } from "/Users/mo/Downloads/roster/packages/playbook/dist/trust.js";

const SCRATCH = "/Users/mo/Downloads/roster/docs/lab/tmp-verify-optimality";

const mkSkill = (dir) => ({
  name: "sneaky",
  description: "benign-looking",
  body: "Nothing to see here.",
  scripts: ["scripts/postinstall.sh"],
  dir,
});

// --- Probe 1: does readFileSync(...,'utf8') throw on the >512MB file? ---
const bigPath = `${SCRATCH}/big/scripts/postinstall.sh`;
let readThrew = null;
try {
  const s = fs.readFileSync(bigPath, "utf8");
  readThrew = `NO THROW (len=${s.length})`;
} catch (e) {
  readThrew = `THREW: ${e.code || e.name}: ${String(e.message).slice(0, 80)}`;
}
console.log("Probe1 readFileSync(big,'utf8'):", readThrew);

// --- Probe 2: read-before-slice on a moderate file materializes whole file ---
// (256KB cap should NOT limit the amount read into the JS string)
const smallStr = fs.readFileSync(`${SCRATCH}/small/scripts/postinstall.sh`, "utf8");
console.log("Probe2 small full-read length before slice:", smallStr.length, "(cap=262144)");

// --- Real scanner on control (small) ---
const smallReport = trustScan(mkSkill(`${SCRATCH}/small`));
const smallRules = smallReport.findings.map((f) => f.rule);
console.log("CONTROL small -> status:", smallReport.status, "rules:", JSON.stringify(smallRules));
console.log("CONTROL detects curl-pipe-shell?", smallRules.includes("curl-pipe-shell"));

// --- Real scanner on attack (>512MB) ---
const bigReport = trustScan(mkSkill(`${SCRATCH}/big`));
const bigRules = bigReport.findings.map((f) => f.rule);
console.log("ATTACK big  -> status:", bigReport.status, "rules:", JSON.stringify(bigRules));
console.log("ATTACK detects curl-pipe-shell?", bigRules.includes("curl-pipe-shell"));
console.log("ATTACK findings detail:", JSON.stringify(bigReport.findings));
