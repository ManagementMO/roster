import { Ajv2020 } from "/Users/mo/Downloads/roster/node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/2020.js";

// ── EXACT copy of post-fix stripSchemaIdentity (rosterServer.ts:376-387) ──
function stripSchemaIdentity(value) {
  if (Array.isArray(value)) return value.map(stripSchemaIdentity);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "$id" || k === "$schema" || k === "$anchor") continue;
      out[k] = stripSchemaIdentity(v);
    }
    return out;
  }
  return value;
}

// POST-FIX argsMatchSchema (line 370-373)
function postFix(schema, args) {
  const ajv = new Ajv2020({ strict: false });
  return ajv.validate(stripSchemaIdentity(schema), args);
}

// PRE-FIX behavior (b69f605~1): fresh Ajv, strip ROOT $schema only, keep $id/$anchor.
// (Fresh Ajv used to isolate the $ref question from the shared-registry poisoning bug.)
function preFix(schema, args) {
  const ajv = new Ajv2020({ strict: false });
  const { $schema: _dialect, ...rest } = schema;
  return ajv.validate(rest, args);
}

// Mimic sixthManSuggestion's try/catch (line 320-327): throw -> compatible=false.
function compat(fn, schema, args) {
  try { return { ok: fn(schema, args), threw: false }; }
  catch (e) { return { ok: false, threw: true, msg: String(e.message || e) }; }
}

const cases = [
  {
    name: "A. $anchor-based $ref (#child -> $anchor:child)",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { kid: { $ref: "#child" } },
      required: ["kid"],
      $defs: { c: { $anchor: "child", type: "string" } },
    },
    goodArgs: { kid: "hello" },
    badArgs: { kid: 42 },
  },
  {
    name: "B. absolute-URI $ref (-> nested $id)",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://ex.com/root.json",
      type: "object",
      properties: { kid: { $ref: "https://ex.com/child.json" } },
      required: ["kid"],
      $defs: { c: { $id: "https://ex.com/child.json", type: "string" } },
    },
    goodArgs: { kid: "hello" },
    badArgs: { kid: 42 },
  },
  {
    name: "C. JSON-pointer $ref (#/$defs/x) — no $id/$anchor needed",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { kid: { $ref: "#/$defs/x" } },
      required: ["kid"],
      $defs: { x: { type: "string" } },
    },
    goodArgs: { kid: "hello" },
    badArgs: { kid: 42 },
  },
  {
    name: "D. defs-nested $id + JSON-pointer $ref (common zod/typebox shape)",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { kid: { $ref: "#/$defs/x" } },
      required: ["kid"],
      $defs: { x: { $id: "urn:x", type: "string" } },
    },
    goodArgs: { kid: "hello" },
    badArgs: { kid: 42 },
  },
  {
    name: "E. plain object schema, no $ref at all (typical MCP tool)",
    schema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { q: { type: "string" }, k: { type: "number" } },
      required: ["q"],
    },
    goodArgs: { q: "search" },
    badArgs: { q: 5 },
  },
];

for (const c of cases) {
  const preG = compat(preFix, c.schema, c.goodArgs);
  const preB = compat(preFix, c.schema, c.badArgs);
  const postG = compat(postFix, c.schema, c.goodArgs);
  const postB = compat(postFix, c.schema, c.badArgs);
  console.log("\n" + c.name);
  console.log("  PRE  good=%s bad=%s%s", preG.ok, preB.ok, preG.threw||preB.threw ? "  THREW:"+(preG.msg||preB.msg) : "");
  console.log("  POST good=%s bad=%s%s", postG.ok, postB.ok, postG.threw||postB.threw ? "  THREW: "+(postG.msg||postB.msg) : "");
  const preDiscriminates = preG.ok === true && preB.ok === false;
  const postDiscriminates = postG.ok === true && postB.ok === false;
  const regressed = preDiscriminates && !postDiscriminates;
  console.log("  => PRE discriminates=%s  POST discriminates=%s  %s",
    preDiscriminates, postDiscriminates, regressed ? "*** REGRESSION (valid args now read incompatible) ***" : "");
}
