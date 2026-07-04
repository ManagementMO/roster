import { describe, expect, it } from "vitest";
import { namespacedId, parseNamespacedId, sanitizeSegment, sanitizeSource } from "./namespacing.js";

describe("namespacing", () => {
  it("builds server__tool ids", () => {
    expect(namespacedId("github", "create_issue")).toBe("github__create_issue");
  });

  it("sanitizes hostile characters", () => {
    expect(sanitizeSegment("we!rd name/©")).toBe("we-rd-name");
    expect(namespacedId("my server (local)", "read/file")).toBe("my-server-local__read-file");
  });

  it("never leaves the separator inside the source segment", () => {
    expect(sanitizeSource("a__b__c")).toBe("a_b_c");
    const id = namespacedId("a__b", "tool__name");
    const parsed = parseNamespacedId(id);
    expect(parsed).toEqual({ source: "a_b", name: "tool__name" });
  });

  it("round-trips parse", () => {
    const id = namespacedId("filesystem", "read_text_file");
    expect(parseNamespacedId(id)).toEqual({ source: "filesystem", name: "read_text_file" });
  });

  it("rejects malformed ids", () => {
    expect(parseNamespacedId("no-separator")).toBeNull();
    expect(parseNamespacedId("__leading")).toBeNull();
    expect(parseNamespacedId("trailing__")).toBeNull();
  });

  it("never returns an empty segment", () => {
    expect(sanitizeSegment("©®™")).toBe("x");
  });
});
