import { describe, expect, it } from "vitest";
import {
  namespacedId,
  normalizeBackendName,
  parseNamespacedId,
  sanitizeSegment,
  sanitizeSource,
} from "./namespacing.js";

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

  it("a source ending in '_' can never collide with a name starting in '_'", () => {
    // Pre-fix these both minted "a___b" and routed to the wrong backend.
    const trailing = namespacedId("a_", "b");
    const leading = namespacedId("a", "_b");
    expect(trailing).not.toBe(leading);
    // And each still round-trips to a non-empty, correctly-split identity.
    expect(parseNamespacedId(trailing)).toEqual({ source: "a", name: "b" });
    expect(parseNamespacedId(leading)).toEqual({ source: "a", name: "_b" });
  });

  it("normalizeBackendName applies the reserved-namespace rename deterministically", () => {
    expect(normalizeBackendName("skill")).toBe("skill-server");
    expect(normalizeBackendName("my server")).toBe("my-server");
    expect(normalizeBackendName("memory")).toBe("memory");
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
