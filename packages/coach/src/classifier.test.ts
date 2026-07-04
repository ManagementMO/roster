import { describe, expect, it } from "vitest";
import { classifyOutcome, classifyToolFailKind, isAttributable } from "./classifier.js";

describe("classifyOutcome precedence", () => {
  it("transport beats everything", () => {
    expect(
      classifyOutcome({ transportError: true, isError: true, errorText: "429" }),
    ).toBe("hard_fail:transport");
  });

  it("protocol beats tool-level evidence", () => {
    expect(classifyOutcome({ protocolError: true, isError: true })).toBe("hard_fail:protocol");
  });

  it("timeout beats isError", () => {
    expect(classifyOutcome({ timedOut: true, isError: true, errorText: "401" })).toBe(
      "tool_fail:timeout",
    );
  });

  it("isError classifies by error text", () => {
    expect(classifyOutcome({ isError: true, errorText: "401 Unauthorized" })).toBe(
      "tool_fail:auth",
    );
    expect(classifyOutcome({ isError: true, errorText: "Rate limit exceeded (429)" })).toBe(
      "tool_fail:quota",
    );
    expect(
      classifyOutcome({ isError: true, errorText: "validation failed: required field 'path'" }),
    ).toBe("tool_fail:schema");
    expect(classifyOutcome({ isError: true, errorText: "Internal Server Error" })).toBe(
      "tool_fail:internal",
    );
    expect(classifyOutcome({ isError: true, errorText: "something odd happened" })).toBe(
      "tool_fail:other",
    );
    expect(classifyOutcome({ isError: true })).toBe("tool_fail:other");
  });

  it("output schema violation without isError is drift-suspect", () => {
    expect(classifyOutcome({ outputSchemaViolation: true })).toBe("schema_drift_suspect");
  });

  it("clean call is success", () => {
    expect(classifyOutcome({})).toBe("success");
  });
});

describe("classifyToolFailKind ordering", () => {
  it("auth wins over schema wording", () => {
    expect(classifyToolFailKind("invalid token provided")).toBe("auth");
  });
  it("timeout phrasings", () => {
    expect(classifyToolFailKind("request timed out after 30s")).toBe("timeout");
    expect(classifyToolFailKind("ETIMEDOUT")).toBe("timeout");
  });
});

describe("attribution fairness (methodology §8)", () => {
  it("input-validation rejections do NOT ding a tool's public score", () => {
    // Modern servers fold JSON-RPC -32602 into isError text → tool_fail:schema;
    // that's the caller's malformed args, not a tool defect.
    expect(isAttributable("tool_fail:schema")).toBe(false);
  });
  it("genuine faults stay attributable", () => {
    expect(isAttributable("success")).toBe(true);
    expect(isAttributable("hard_fail:transport")).toBe(true);
    expect(isAttributable("tool_fail:internal")).toBe(true);
    expect(isAttributable("schema_drift_suspect")).toBe(true); // OUTPUT drift = tool's fault
  });
});
