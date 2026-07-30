import fs from "node:fs";

/** O_NONBLOCK is POSIX-only; on Windows the flag is simply absent. */
const NON_BLOCK =
  (fs.constants as typeof fs.constants & { O_NONBLOCK?: number }).O_NONBLOCK ?? 0;

/**
 * Read at most `maxBytes` from the head of a file WITHOUT loading the whole
 * thing, reporting whether content was left behind.
 *
 * `readFileSync(...).slice()` reads the entire file first, so a huge hostile
 * file OOMs or stalls — and when that throw is swallowed by a caller the content
 * is silently left UNSCANNED, which is the false-negative the trust scan exists
 * to close. One extra byte is requested so truncation is known without a second
 * stat racing the read.
 *
 * Opening uses O_NONBLOCK so a FIFO or device masquerading as a skill file can
 * never block boot, and the OPENED DESCRIPTOR is `fstat`-checked so only a
 * regular file is ever read. O_NOFOLLOW is deliberately NOT set: a symlinked
 * SKILL.md is legitimate (dotfile managers), and checking the descriptor we
 * actually read from is stronger than checking the path we were given.
 */
export function readFileHead(
  file: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | NON_BLOCK);
  try {
    if (!fs.fstatSync(fd).isFile()) {
      throw new Error("refusing to read a non-regular file");
    }
    const buf = Buffer.allocUnsafe(maxBytes + 1);
    const n = fs.readSync(fd, buf, 0, maxBytes + 1, 0);
    const truncated = n > maxBytes;
    // A multi-byte sequence straddling the cap decodes to U+FFFD — harmless for
    // substring scanning, and the truncation is reported to the caller anyway.
    return { text: buf.subarray(0, truncated ? maxBytes : n).toString("utf8"), truncated };
  } finally {
    fs.closeSync(fd);
  }
}
