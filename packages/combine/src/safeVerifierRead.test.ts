import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readVerifierFile } from "./safeVerifierRead.js";

/**
 * L8. The Combine's reading verifiers used `fs.readFileSync(path, "utf8")` on an
 * attacker-controlled sandbox (contributed suites + probed servers are both
 * untrusted). `readVerifierFile` replaces it with a descriptor-pinned read that
 * cannot hang on a FIFO, OOM on a huge file, or follow a symlink swapped in after
 * the path was validated. These tests exercise those three properties directly.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "roster-verread-"));
  dirs.push(d);
  return d;
}

describe("readVerifierFile: safe, bounded, no-follow verifier read", () => {
  it("reads a regular file exactly and reports no truncation", () => {
    const d = tmp();
    const p = path.join(d, "f.txt");
    fs.writeFileSync(p, "hello world");
    expect(readVerifierFile(p, { sandboxRoot: d })).toEqual({
      text: "hello world",
      truncated: false,
    });
  });

  it("bounds a large file to the cap and reports truncation (no unbounded slurp)", () => {
    const d = tmp();
    const p = path.join(d, "big.txt");
    fs.writeFileSync(p, "x".repeat(10_000));
    const read = readVerifierFile(p, { sandboxRoot: d, maxBytes: 16 });
    expect(read.truncated).toBe(true);
    expect(read.text.length).toBeLessThanOrEqual(16);
  });

  // POSIX-only: `mkfifo` is not available on Windows (and O_NONBLOCK is absent).
  // The Windows-safe fallback in readVerifierFile (flags → 0, fstat regular-file
  // guard) is still exercised by the regular-file / directory / huge-file cases.
  it.skipIf(process.platform === "win32")("refuses a FIFO instead of blocking forever on the open (liveness)", () => {
    const d = tmp();
    const fifo = path.join(d, "pipe");
    execFileSync("mkfifo", [fifo]);
    // With the unsafe read this call blocks the event loop on open() with no
    // writer and the test times out; the safe read throws immediately.
    expect(() => readVerifierFile(fifo, { sandboxRoot: d })).toThrow(/non-regular file/);
  }, 8_000);

  it("refuses a directory (only regular files are read)", () => {
    const d = tmp();
    const sub = path.join(d, "sub");
    fs.mkdirSync(sub);
    expect(() => readVerifierFile(sub, { sandboxRoot: d })).toThrow(/non-regular file/);
  });

  // POSIX-only: O_NOFOLLOW does not exist on Windows (the flag degrades to 0),
  // and creating a symlink there needs elevated privilege. On POSIX this proves
  // the descriptor-pinned read refuses a final-component symlink.
  it.skipIf(process.platform === "win32")("does not follow a symlink at the final component (no-follow / TOCTOU)", () => {
    const d = tmp();
    const real = path.join(d, "real.txt");
    fs.writeFileSync(real, "SECRET_TARGET_CONTENT");
    const link = path.join(d, "link.txt");
    fs.symlinkSync(real, link);
    // O_NOFOLLOW fails the open (ELOOP) rather than reading through the link, so
    // the verifier can never be tricked into reading a swapped-in symlink.
    expect(() => readVerifierFile(link, { sandboxRoot: d })).toThrow();
    // And it certainly never returns the link target's content.
    let leaked = "";
    try {
      leaked = readVerifierFile(link, { sandboxRoot: d }).text;
    } catch {
      /* expected */
    }
    expect(leaked).not.toContain("SECRET_TARGET_CONTENT");
  });

  it.skipIf(process.platform === "win32")("rejects an intermediate-directory symlink swapped in during open", () => {
    const d = tmp();
    const sandbox = path.join(d, "sandbox");
    const parent = path.join(sandbox, "parent");
    const displaced = path.join(sandbox, "parent-before-swap");
    const outside = path.join(d, "outside");
    const target = path.join(parent, "result.txt");
    fs.mkdirSync(parent, { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(target, "SAFE_SANDBOX_CONTENT");
    fs.writeFileSync(path.join(outside, "result.txt"), "OUTSIDE_SECRET_CONTENT");

    const realOpen = fs.openSync.bind(fs);
    const open = vi.spyOn(fs, "openSync").mockImplementationOnce(((...args: Parameters<typeof fs.openSync>) => {
      fs.renameSync(parent, displaced);
      fs.symlinkSync(outside, parent, "dir");
      return realOpen(...args);
    }) as typeof fs.openSync);
    try {
      expect(() => readVerifierFile(target, { sandboxRoot: sandbox })).toThrow();
    } finally {
      open.mockRestore();
    }
  });

  it("rejects an intermediate directory replaced during open (platform-neutral identity lock)", () => {
    const d = tmp();
    const sandbox = path.join(d, "sandbox");
    const parent = path.join(sandbox, "parent");
    const displaced = path.join(sandbox, "parent-before-swap");
    const replacement = path.join(sandbox, "replacement");
    const target = path.join(parent, "result.txt");
    fs.mkdirSync(parent, { recursive: true });
    fs.mkdirSync(replacement);
    fs.writeFileSync(target, "ORIGINAL_CONTENT");
    fs.writeFileSync(path.join(replacement, "result.txt"), "REPLACEMENT_CONTENT");

    const realOpen = fs.openSync.bind(fs);
    const open = vi.spyOn(fs, "openSync").mockImplementationOnce(((...args: Parameters<typeof fs.openSync>) => {
      fs.renameSync(parent, displaced);
      fs.renameSync(replacement, parent);
      return realOpen(...args);
    }) as typeof fs.openSync);
    try {
      expect(() => readVerifierFile(target, { sandboxRoot: sandbox })).toThrow(
        /changed while being opened/,
      );
    } finally {
      open.mockRestore();
    }
  });
});
