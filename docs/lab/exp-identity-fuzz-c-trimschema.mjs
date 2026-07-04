#!/usr/bin/env node
/**
 * identity-fuzz C — trimSchema/toCard torture: pathological real-world-shaped
 * schemas through the built @rosterhq/router dist. Measures wall time, throw
 * behavior, JSON validity, and output SIZE (the trim's whole purpose is token
 * thrift — so we measure bytes that survive the trim).
 * Output: docs/lab/tmp-identity-fuzz/results-c.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliReq = createRequire(path.join(repo, "packages/cli/package.json"));
const { trimSchema, toCard } = await import(cliReq.resolve("@rosterhq/router"));

function timeIt(fn) {
  const t0 = process.hrtime.bigint();
  try {
    const value = fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { ok: true, value, ms };
  } catch (err) {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { ok: false, error: `${err?.constructor?.name}: ${err?.message}`.slice(0, 160), ms };
  }
}

// ── build the torture schemas ────────────────────────────────────────────────
const cases = [];

// 1. cyclic $ref (string form — what a real server can send over JSON-RPC)
cases.push({
  name: "cyclic $ref (string)",
  schema: { type: "object", properties: { node: { $ref: "#" }, next: { $ref: "#/properties/node" } } },
});

// 2. true JS object cycle (only reachable via in-process TransportBackendConfig)
const cyc = { type: "object", properties: {} };
cyc.properties.self = cyc;
cases.push({ name: "cyclic object graph", schema: cyc });

// 3. cyclic array inside enum (stringify landmine)
const cycEnum = ["a", "b"];
cycEnum.push(cycEnum);
cases.push({ name: "cyclic enum array", schema: { type: "object", properties: { mode: { type: "string", enum: cycEnum } } } });

// 4. 50-deep nesting
let deep = { type: "string" };
for (let i = 0; i < 50; i++) deep = { type: "object", properties: { [`lvl${i}`]: deep } };
cases.push({ name: "50-deep nesting", schema: deep });

// 5. 500 properties
const props500 = {};
for (let i = 0; i < 500; i++)
  props500[`param_${i}`] = { type: "string", description: `long prose description for parameter number ${i} — `.repeat(3) };
cases.push({ name: "500 properties", schema: { type: "object", properties: props500, required: Object.keys(props500).slice(0, 100) } });

// 6. 1000-entry enum
const enum1000 = Array.from({ length: 1000 }, (_, i) => `region-${i}-${"x".repeat(20)}`);
cases.push({ name: "1000-entry enum", schema: { type: "object", properties: { region: { type: "string", enum: enum1000 } } } });

// 7. anyOf-of-anyOfs (20 levels, branching 2)
function anyOfTower(depth) {
  if (depth === 0) return { type: "string" };
  return { anyOf: [anyOfTower(depth - 1), anyOfTower(depth - 1)] };
}
cases.push({ name: "anyOf-of-anyOfs depth 12 (top-level)", schema: { anyOf: [anyOfTower(11), anyOfTower(11)] } });
cases.push({
  name: "anyOf under properties",
  schema: { type: "object", properties: { input: { anyOf: [{ type: "string" }, { type: "object", properties: { url: { type: "string" } } }] } } },
});

// 8. boolean schemas + null-ish
cases.push({ name: "boolean schema true", schema: true });
cases.push({ name: "boolean schema false", schema: false });
cases.push({ name: "null schema", schema: null });
cases.push({ name: "undefined schema", schema: undefined });
cases.push({ name: "array-as-schema", schema: [{ type: "object" }] });
cases.push({ name: "properties-as-array", schema: { type: "object", properties: [{ type: "string" }, { type: "number" }] } });
cases.push({ name: "type-as-object", schema: { type: { weird: true }, properties: { a: { type: "string" } } } });

// 9. realistic fat schema (github-create-pr-shaped: nested objects + prose)
const fat = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    title: { type: "string", description: "The title of the new pull request. ".repeat(10) },
    body: { type: "string", description: "The contents of the pull request. ".repeat(40) },
    head: { type: "string", description: "The name of the branch where your changes are implemented. ".repeat(10) },
    base: { type: "string", description: "The name of the branch you want the changes pulled into. ".repeat(10) },
    reviewers: { type: "array", items: { type: "object", properties: { login: { type: "string", description: "GitHub username. ".repeat(5) } } } },
    labels: { type: "array", items: { type: "string", enum: Array.from({ length: 60 }, (_, i) => `label-${i}`) } },
  },
  required: ["title", "head", "base"],
};
cases.push({ name: "realistic fat schema (github-ish)", schema: fat });

// ── run trimSchema on each ──────────────────────────────────────────────────
const trimResults = [];
for (const c of cases) {
  const r = timeIt(() => trimSchema(c.schema));
  let stringify = null;
  let outBytes = null;
  let inBytes = null;
  try { inBytes = JSON.stringify(c.schema)?.length ?? null; } catch { inBytes = "unstringifiable(cycle)"; }
  if (r.ok) {
    const s = timeIt(() => JSON.stringify(r.value));
    stringify = s.ok ? "ok" : s.error;
    outBytes = s.ok ? s.value.length : null;
  }
  trimResults.push({
    case: c.name, throws: !r.ok, error: r.ok ? null : r.error, ms: +r.ms.toFixed(3),
    under100ms: r.ms < 100, inBytes, outBytes, stringifyOfCard: stringify,
    trimmedShape: r.ok && outBytes !== null && outBytes < 400 ? r.value : undefined,
  });
}

// ── toCard + handleDraft-style stringify (the actual hot path) ──────────────
const cardResults = [];
for (const c of cases) {
  const entry = { id: "torture__t", kind: "tool", source: "torture", name: "t", description: "torture case " + c.name, inputSchema: c.schema };
  const r = timeIt(() => JSON.stringify({ starters: [toCard(entry)] }, null, 2));
  cardResults.push({ case: c.name, throws: !r.ok, error: r.ok ? null : r.error, ms: +r.ms.toFixed(3), cardBytes: r.ok ? r.value.length : null });
}

// ── the "trim actually trims?" measurement on the two token-sink cases ──────
const sink = {};
for (const name of ["1000-entry enum", "500 properties", "realistic fat schema (github-ish)"]) {
  const t = trimResults.find((x) => x.case === name);
  sink[name] = { inBytes: t.inBytes, outBytes: t.outBytes, keptFraction: typeof t.inBytes === "number" && t.outBytes ? +(t.outBytes / t.inBytes).toFixed(3) : null };
}

const out = { experiment: "identity-fuzz-c-trimschema", when: new Date().toISOString(), trimResults, cardResults, tokenSink: sink };
const outPath = path.join(repo, "docs/lab/tmp-identity-fuzz/results-c.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

for (const t of trimResults)
  console.log(
    `${t.throws ? "THROW" : t.under100ms ? "ok   " : "SLOW "} ${t.case.padEnd(38)} ${String(t.ms).padStart(8)}ms in=${t.inBytes} out=${t.outBytes} stringify=${t.stringifyOfCard}${t.throws ? " " + t.error : ""}`,
  );
console.log("card-path (toCard+stringify):");
for (const t of cardResults.filter((x) => x.throws)) console.log(`  CARD-THROW ${t.case}: ${t.error}`);
console.log("tokenSink:", JSON.stringify(sink));
console.log(`wrote ${outPath}`);
