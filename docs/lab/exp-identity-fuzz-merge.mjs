#!/usr/bin/env node
/** identity-fuzz — merge per-part raw outputs into docs/lab/results-identity-fuzz.json */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const lab = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(lab, "tmp-identity-fuzz");
const parts = {};
for (const f of ["a", "b", "c", "d", "d2", "e"]) {
  parts[f] = JSON.parse(fs.readFileSync(path.join(tmp, `results-${f}.json`), "utf8"));
}

const merged = {
  slug: "identity-fuzz",
  charter: "namespacing collisions, backend registry, schema-trim torture, ajv args_compatible",
  when: new Date().toISOString(),
  environment: {
    node: process.version,
    ajv: "8.20.0 (packages/router/node_modules)",
    realComponents: [
      "built dist of @rosterhq/shared, @rosterhq/router, @rosterhq/coach",
      "real @modelcontextprotocol/sdk Server+Client over InMemoryTransport (router's own TransportBackendConfig hook)",
      "real npx @modelcontextprotocol/server-filesystem OS process over stdio (experiment E)",
      "real SQLite via openCoachDb(':memory:')",
    ],
    noEmbeddings: "charter is identity/schema — no retrieval claims made, so no model was loaded (RAM left to siblings)",
  },
  headline: {
    roundtrip: `${parts.a.roundtrip.ok}/${parts.a.roundtrip.total} fuzz pairs round-trip; all ${parts.a.roundtrip.mismatchCount} failures are the underscore-boundary mechanism`,
    collisions: `${parts.a.systematic.crossBoundaryCollisionIds} ids in the 159,201-pair systematic hunt carry >=2 DISTINCT sanitized identities`,
    liveMisroute: `duplicate id a___b across two live backends; call for backend 'a' tool '_b' answered by backend 'a_' tool 'b'`,
    bootSwap: `id my-server__run answered by PHYS-A in boot1 and PHYS-B in boot2 (first backend down)`,
    pruneMismatch: `serve.ts protection set uses config-name sanitization; renamed/suffixed sources unprotected -> 14/14 real filesystem-server capabilities pruned despite 'learned state is preserved' promise`,
    ajvIdPoisoning: `live wire args_compatible sequence for identical args: [true,false,false] when alternate schema carries $id`,
    ajvLeak: `prod destructure pattern recompiles per suggestion: 42.9ms + ~0.3MB per validate (500-prop schema), 0.19ms + 23.6KB (small); ajv._cache 2008 entries after 2000 calls; same-object baseline 0.031ms`,
    trim: `all 16 torture cases terminate <0.2ms; 1000-entry enum passes through card at keptFraction=1.0 (33,958 bytes)`,
    serverAlive: `no crash in any live run: five-mode rig alive after 3 failing calls + suggestions; transparent rig alive with cyclic schema onboard`,
  },
  a_roundtrip_collisions: parts.a,
  b_registry: parts.b,
  c_trimschema: parts.c,
  d_ajv: parts.d,
  d2_ajv_followup: parts.d2,
  e_realserver: parts.e,
};

const out = path.join(lab, "results-identity-fuzz.json");
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
