import { describe, expect, it } from "vitest";
import { trimSchema } from "./cards.js";
import { argsMatchSchema } from "./rosterServer.js";

describe("trimSchema width guards", () => {
  it("caps a pathological enum instead of passing 1000 values into a draft card", () => {
    const enumValues = Array.from({ length: 1000 }, (_, i) => `v${i}`);
    const trimmed = trimSchema({
      type: "object",
      properties: { mode: { type: "string", enum: enumValues } },
    });
    const mode = (trimmed.properties as Record<string, { enum?: unknown[] }>).mode;
    expect(mode.enum).toHaveLength(16);
    expect((trimmed.properties as Record<string, Record<string, unknown>>).mode["x-enum-truncated"]).toBe(984);
  });

  it("caps property width, keeping required props first, and flags the elision", () => {
    const properties: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) properties[`p${i}`] = { type: "string" };
    const trimmed = trimSchema({ type: "object", properties, required: ["p199"] });
    const keptKeys = Object.keys(trimmed.properties as Record<string, unknown>);
    expect(keptKeys).toHaveLength(50);
    expect(keptKeys[0]).toBe("p199"); // required prop is never dropped
    expect(trimmed["x-trimmed-properties"]).toBe(150);
  });

  it("leaves small schemas untouched", () => {
    const trimmed = trimSchema({ type: "object", properties: { path: { type: "string" } }, required: ["path"] });
    expect(trimmed).toEqual({ type: "object", properties: { path: { type: "string" } }, required: ["path"] });
  });
});

describe("argsMatchSchema — no cross-call $id poisoning", () => {
  const schema = {
    $id: "https://example.com/schemas/thing.json",
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
  };

  it("returns a STABLE verdict across repeated calls (was true-then-false-forever)", () => {
    const good = { name: "x" };
    const bad = {};
    expect(argsMatchSchema(schema, good)).toBe(true);
    expect(argsMatchSchema(schema, good)).toBe(true); // 2nd call once threw "$id already exists" → false
    expect(argsMatchSchema(schema, good)).toBe(true);
    expect(argsMatchSchema(schema, bad)).toBe(false); // genuine mismatch still fails
    expect(argsMatchSchema(schema, good)).toBe(true);
  });

  it("still resolves a $ref that targets a $id (keeping $id must not break refs)", () => {
    const withRef = {
      $id: "https://ex.com/root.json",
      type: "object",
      properties: { child: { $ref: "https://ex.com/child.json" } },
      required: ["child"],
      $defs: { c: { $id: "https://ex.com/child.json", type: "object", properties: { n: { type: "number" } }, required: ["n"] } },
    };
    expect(argsMatchSchema(withRef, { child: { n: 1 } })).toBe(true);
    expect(argsMatchSchema(withRef, { child: {} })).toBe(false); // ref actually enforced, not bypassed
  });
});
