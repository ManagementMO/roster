import fs from "node:fs";

/** O_NONBLOCK / O_NOFOLLOW are POSIX-only; on Windows the flags are absent. */
const NON_BLOCK =
  (fs.constants as typeof fs.constants & { O_NONBLOCK?: number }).O_NONBLOCK ?? 0;
const NO_FOLLOW =
  (fs.constants as typeof fs.constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;

/**
 * The Combine runs CONTRIBUTED, UNTRUSTED suites against a TARGET SERVER that we
 * are deliberately probing for misbehavior — so the sandbox contents a file
 * verifier reads are attacker-controlled. The reading verifiers (`fileEquals`,
 * `fileContains`) previously did `fs.readFileSync(path, "utf8")`, which has three
 * failure modes a hostile server triggers by simply creating the wrong kind of
 * entry at the expected path:
 *   • FIFO / device — `readFileSync` opens it BLOCKING, so a named pipe with no
 *     writer hangs the verify phase forever (there is no verify-phase timeout).
 *   • huge file — the whole file is slurped into memory (OOM / stall).
 *   • symlink swapped in AFTER `entryIsSafeExact` validated the path — the
 *     re-open by path follows it and the verifier reads THROUGH the sandbox.
 *
 * This read closes all three at the descriptor we actually read from:
 *   • O_NONBLOCK — opening a FIFO returns immediately instead of blocking.
 *   • fstat isFile() — only a regular file is ever read; a FIFO/dir/device/socket
 *     is refused (throws), which the caller turns into a clean verify failure.
 *   • O_NOFOLLOW — a symlink at the final component fails the open (ELOOP), so
 *     the read cannot follow a link the pre-check never saw (TOCTOU). Unlike the
 *     playbook SKILL.md read, a symlinked verifier target is NEVER legitimate
 *     here, so no-follow is correct.
 *   • bounded — at most `maxBytes` are read; a larger file reports `truncated`
 *     so `fileEquals` can never spuriously match on a prefix.
 * One extra byte is requested so truncation is known without a second stat.
 */
export const MAX_VERIFIER_FILE_BYTES = 8 * 1024 * 1024;

export function readVerifierFile(
  file: string,
  maxBytes: number = MAX_VERIFIER_FILE_BYTES,
): { text: string; truncated: boolean } {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | NON_BLOCK | NO_FOLLOW);
  try {
    if (!fs.fstatSync(fd).isFile()) {
      throw new Error("refusing to read a non-regular file");
    }
    const buf = Buffer.allocUnsafe(maxBytes + 1);
    const n = fs.readSync(fd, buf, 0, maxBytes + 1, 0);
    const truncated = n > maxBytes;
    // A multi-byte sequence straddling the cap decodes to U+FFFD — harmless for
    // exact/`includes` comparison, and truncation is reported to the caller so a
    // too-large file is treated as a mismatch, never an accidental prefix match.
    return { text: buf.subarray(0, truncated ? maxBytes : n).toString("utf8"), truncated };
  } finally {
    fs.closeSync(fd);
  }
}
