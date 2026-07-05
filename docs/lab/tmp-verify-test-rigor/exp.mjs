import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Mirror runner.ts entryExistsExact exactly
function entryExistsExact(abs) {
  let entries;
  try { entries = fs.readdirSync(path.dirname(abs)); } catch { return false; }
  return entries.includes(path.basename(abs));
}

const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "roster-exp-")));

// --- Case test: write 'Combine.txt', query 'combine.txt' ---
fs.writeFileSync(path.join(sandbox, "Combine.txt"), "x");
const caseQ = path.join(sandbox, "combine.txt");
console.log("CASE  existsSync(combine.txt)      =", fs.existsSync(caseQ));
console.log("CASE  entryExistsExact(combine.txt)=", entryExistsExact(caseQ));

// --- NFD test: write NFC 'café.txt', query NFD 'café.txt' ---
const nfc = "café.txt".normalize("NFC");
const nfd = "café.txt".normalize("NFD");
console.log("NFC===NFD bytes?", nfc === nfd, "(len", nfc.length, "vs", nfd.length, ")");
fs.writeFileSync(path.join(sandbox, nfc), "x");
const nfdQ = path.join(sandbox, nfd);
console.log("NFD   existsSync(NFD café.txt)      =", fs.existsSync(nfdQ));
console.log("NFD   entryExistsExact(NFD café.txt)=", entryExistsExact(nfdQ));

// --- Control: exact ASCII match (what every test actually uses) ---
fs.writeFileSync(path.join(sandbox, "d.txt"), "x");
const exactQ = path.join(sandbox, "d.txt");
console.log("EXACT existsSync(d.txt)             =", fs.existsSync(exactQ));
console.log("EXACT entryExistsExact(d.txt)       =", entryExistsExact(exactQ));

// --- What on-disk name did readdir actually store for the NFC write? ---
console.log("on-disk entries:", JSON.stringify(fs.readdirSync(sandbox)));

fs.rmSync(sandbox, { recursive: true, force: true });
