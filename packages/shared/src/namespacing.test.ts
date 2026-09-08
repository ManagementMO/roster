import { describe, expect, it } from "vitest";
import {
  parseNamespacedId,
  sanitizeSegment,
  sanitizeSource,
  stableBackendName,
  stableNamespacedId,
  stableSegment,
} from "./namespacing.js";

describe("namespacing", () => {
  it("builds server__tool ids", () => {
    expect(stableNamespacedId("github", "create_issue")).toBe("github__create_issue");
  });

  it("sanitizes hostile characters", () => {
    expect(sanitizeSegment("we!rd name/©")).toBe("we-rd-name");
    expect(stableNamespacedId("my server (local)", "read/file")).toMatch(
      /^my-server-local__read-file-[a-f0-9]{10}$/,
    );
  });

  it("makes a sanitized public segment stable without collapsing distinct raw names", () => {
    expect(stableSegment("safe.tool")).toMatch(/^safe-tool-[a-f0-9]{10}$/);
    expect(stableSegment("safe tool")).not.toBe(stableSegment("safe.tool"));
    expect(stableNamespacedId("my server (local)", "read/file")).toMatch(
      /^my-server-local__read-file-[a-f0-9]{10}$/,
    );
  });

  it("rehash-qualifies safe raw names that impersonate generated suffixes", () => {
    const generated = stableSegment("safe.tool");
    expect(stableSegment(generated)).not.toBe(generated);
    expect(stableSegment(generated)).toMatch(new RegExp(`^${generated}-[a-f0-9]{10}$`));
  });

  it("never leaves the separator inside the source segment", () => {
    expect(sanitizeSource("a__b__c")).toBe("a_b_c");
    const id = stableNamespacedId("a__b", "tool__name");
    const parsed = parseNamespacedId(id);
    expect(parsed?.source).toBe("a_b");
    expect(parsed?.name.startsWith("tool__name")).toBe(true);
  });

  it("a source ending in '_' can never collide with a name starting in '_'", () => {
    // Pre-fix these both minted "a___b" and routed to the wrong backend.
    const trailing = stableNamespacedId("a_", "b");
    const leading = stableNamespacedId("a", "_b");
    expect(trailing).not.toBe(leading);
    // And each still round-trips to a non-empty, correctly-split identity.
    expect(parseNamespacedId(trailing)).toEqual({ source: "a", name: "b" });
    expect(parseNamespacedId(leading)?.source).toBe("a");
  });

  it("the reserved 'skill' namespace is renamed for backend identities", () => {
    expect(stableBackendName("skill")).toBe("skill-server");
    expect(stableBackendName("memory")).toBe("memory");
  });

  it("keeps backend identities stable across sanitized collisions", () => {
    expect(stableBackendName("mail!")).toBe(stableBackendName("mail!"));
    expect(stableBackendName("mail!")).not.toBe(stableBackendName("mail?"));
    expect(
      stableNamespacedId(stableBackendName("a__b"), "tool"),
    ).not.toBe(stableNamespacedId(stableBackendName("a_b"), "tool"));
    expect(stableBackendName("skill")).toBe("skill-server");
    expect(stableBackendName("skill-server")).not.toBe(stableBackendName("skill"));
    expect(stableBackendName("skill-server")).toMatch(/^skill-server-[a-f0-9]{10}$/);
  });

  it("round-trips parse", () => {
    const id = stableNamespacedId("filesystem", "read_text_file");
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
