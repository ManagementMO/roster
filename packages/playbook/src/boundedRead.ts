import fs from "node:fs";
import path from "node:path";

/** O_NONBLOCK / O_NOFOLLOW are POSIX-only; on Windows the flags are absent. */
const NON_BLOCK =
  (fs.constants as typeof fs.constants & { O_NONBLOCK?: number }).O_NONBLOCK ?? 0;
const NO_FOLLOW =
  (fs.constants as typeof fs.constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;

interface ReadSnapshot {
  parent: fs.BigIntStats;
  named: fs.BigIntStats;
  target: fs.BigIntStats;
  symlinked: boolean;
}

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
 * never block boot. The named path, its parent, and the opened descriptor are
 * identity-checked before and after the read, so a swap cannot silently change
 * what was scanned. Symlinks are refused by default. The caller may deliberately
 * allow one for SKILL.md (dotfile managers legitimately link those); the result
 * then records `symlinked: true` so the trust gate cannot lose its review flag
 * even if the name is replaced before the later filesystem walk.
 */
export function readFileHead(
  file: string,
  maxBytes: number,
  options: { allowSymlink?: boolean } = {},
): { text: string; truncated: boolean; symlinked: boolean } {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("bounded read limit must be a positive safe integer");
  }
  const before = snapshot(file);
  if (before.symlinked && !options.allowSymlink) {
    throw new Error("refusing to follow a symlink");
  }
  const noFollow = before.symlinked ? 0 : NO_FOLLOW;
  const fd = fs.openSync(file, fs.constants.O_RDONLY | NON_BLOCK | noFollow);
  try {
    const openedBefore = fs.fstatSync(fd, { bigint: true });
    const afterOpen = snapshot(file);
    if (
      !openedBefore.isFile() ||
      !sameSnapshot(before, afterOpen) ||
      !sameIdentity(openedBefore, afterOpen.target)
    ) {
      throw new Error("bounded-read path changed while being opened");
    }
    const buf = Buffer.allocUnsafe(maxBytes + 1);
    let n = 0;
    while (n < buf.length) {
      const read = fs.readSync(fd, buf, n, buf.length - n, n);
      if (read === 0) break;
      n += read;
    }
    const openedAfter = fs.fstatSync(fd, { bigint: true });
    const afterRead = snapshot(file);
    if (
      !sameStableFile(openedBefore, openedAfter) ||
      !sameSnapshot(before, afterRead) ||
      !sameIdentity(openedAfter, afterRead.target)
    ) {
      throw new Error("bounded-read path changed while being read");
    }
    const truncated = n > maxBytes;
    // A multi-byte sequence straddling the cap decodes to U+FFFD — harmless for
    // substring scanning, and the truncation is reported to the caller anyway.
    return {
      text: buf.subarray(0, truncated ? maxBytes : n).toString("utf8"),
      truncated,
      symlinked: before.symlinked,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function snapshot(file: string): ReadSnapshot {
  const parent = fs.lstatSync(path.dirname(file), { bigint: true });
  if (!parent.isDirectory() || parent.isSymbolicLink()) {
    throw new Error("bounded-read parent is not a regular directory");
  }
  const named = fs.lstatSync(file, { bigint: true });
  const symlinked = named.isSymbolicLink();
  const target = symlinked ? fs.statSync(file, { bigint: true }) : named;
  if (!target.isFile()) {
    throw new Error("refusing to read a non-regular file");
  }
  return { parent, named, target, symlinked };
}

function sameSnapshot(left: ReadSnapshot, right: ReadSnapshot): boolean {
  return (
    left.symlinked === right.symlinked &&
    sameIdentity(left.parent, right.parent) &&
    sameIdentity(left.named, right.named) &&
    sameIdentity(left.target, right.target)
  );
}

function sameIdentity(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFile(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return (
    right.isFile() &&
    sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}
