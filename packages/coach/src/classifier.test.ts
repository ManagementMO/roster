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
  it("an internal fault whose text mentions validation is NOT excused as schema", () => {
    // internal precedence over schema keeps genuine tool crashes attributable.
    expect(classifyToolFailKind("Internal server error during input validation")).toBe("internal");
    expect(classifyOutcome({ isError: true, errorText: "panic: schema assertion failed" })).toBe("tool_fail:internal");
    expect(isAttributable(classifyOutcome({ isError: true, errorText: "500 internal error: invalid state" }))).toBe(true);
  });

  it("a raw-wire -32602 InvalidParams is non-attributable, like the isError-folded case (M3)", () => {
    expect(classifyOutcome({ inputValidationError: true })).toBe("tool_fail:schema");
    expect(isAttributable("tool_fail:schema")).toBe(false);
  });
});

describe("classifyToolFailKind — realistic error texts (audit M4)", () => {
  const cases: Array<[string, string]> = [
    ["Limit of 30000 tokens per min exceeded", "quota"], // was auth via bare `token`
    ["Authenticated requests get a higher rate limit", "quota"], // was auth via `Auth`
    ["Invalid token format in 'path' argument", "schema"], // caller-fault → non-attributable (was auth)
    ["Signature expired", "auth"],
    ["invalid_auth", "auth"],
    ["not_authed", "auth"],
    ["invalid token provided", "auth"], // genuine credential error stays auth
    ["Rate limit exceeded (429)", "quota"],
    ["Internal Server Error", "internal"],
    ["validation failed: required field 'path'", "schema"],
  ];
  for (const [text, kind] of cases) {
    it(`"${text}" → ${kind}`, () => expect(classifyToolFailKind(text)).toBe(kind));
  }
  it("the fairness-critical one is non-attributable", () => {
    expect(isAttributable(classifyOutcome({ isError: true, errorText: "Invalid token format in 'path' argument" }))).toBe(false);
  });
});
