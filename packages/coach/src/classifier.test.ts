import { describe, expect, it } from "vitest";
import { classifyOutcome, classifyToolFailKind } from "./classifier.js";

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
