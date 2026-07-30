import fs from "node:fs";
import path from "node:path";

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
 *   • every directory component and the named file are pinned by identity before
 *     open and checked again after open/read. O_NOFOLLOW is an extra POSIX guard
 *     for the final component. A raced parent symlink therefore cannot redirect
 *     the descriptor outside the sandbox, including on Windows.
 *   • bounded — at most `maxBytes` are read; a larger file reports `truncated`
 *     so `fileEquals` can never spuriously match on a prefix.
 * One extra byte is requested so truncation is known without a second stat.
 */
export const MAX_VERIFIER_FILE_BYTES = 8 * 1024 * 1024;

interface PathSnapshot {
  directories: fs.BigIntStats[];
  file: fs.BigIntStats;
}

export function readVerifierFile(
  file: string,
  options: { sandboxRoot: string; maxBytes?: number },
): { text: string; truncated: boolean } {
  const maxBytes = options.maxBytes ?? MAX_VERIFIER_FILE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("verifier read limit must be a positive safe integer");
  }
  const before = snapshotContainedPath(options.sandboxRoot, file);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | NON_BLOCK | NO_FOLLOW);
  try {
    const openedBefore = fs.fstatSync(fd, { bigint: true });
    const afterOpen = snapshotContainedPath(options.sandboxRoot, file);
    if (
      !openedBefore.isFile() ||
      !sameIdentity(openedBefore, afterOpen.file) ||
      !sameSnapshot(before, afterOpen)
    ) {
      throw new Error("verifier path changed while being opened");
    }
    const buf = Buffer.allocUnsafe(maxBytes + 1);
    let n = 0;
    while (n < buf.length) {
      const read = fs.readSync(fd, buf, n, buf.length - n, n);
      if (read === 0) break;
      n += read;
    }
    const openedAfter = fs.fstatSync(fd, { bigint: true });
    const afterRead = snapshotContainedPath(options.sandboxRoot, file);
    if (
      !sameStableFile(openedBefore, openedAfter) ||
      !sameIdentity(openedAfter, afterRead.file) ||
      !sameSnapshot(before, afterRead)
    ) {
      throw new Error("verifier path changed while being read");
    }
    const truncated = n > maxBytes;
    // A multi-byte sequence straddling the cap decodes to U+FFFD — harmless for
    // exact/`includes` comparison, and truncation is reported to the caller so a
    // too-large file is treated as a mismatch, never an accidental prefix match.
    return { text: buf.subarray(0, truncated ? maxBytes : n).toString("utf8"), truncated };
  } finally {
    fs.closeSync(fd);
  }
}

function snapshotContainedPath(sandboxRoot: string, file: string): PathSnapshot {
  const root = path.resolve(sandboxRoot);
  const target = path.resolve(file);
  const rel = path.relative(root, target);
  if (rel === "" || rel === "." || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error("verifier path escapes sandbox");
  }

  const parts = rel.split(path.sep);
  const directories: fs.BigIntStats[] = [];
  let current = root;
  const rootStat = fs.lstatSync(current, { bigint: true });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("verifier sandbox is not a regular directory");
  }
  directories.push(rootStat);

  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("verifier path contains a non-directory or symlink");
    }
    directories.push(stat);
  }

  const named = fs.lstatSync(target, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink()) {
    throw new Error("refusing to read a non-regular file");
  }
  return { directories, file: named };
}

function sameSnapshot(left: PathSnapshot, right: PathSnapshot): boolean {
  return (
    left.directories.length === right.directories.length &&
    left.directories.every((stat, index) => sameIdentity(stat, right.directories[index]!)) &&
    sameIdentity(left.file, right.file)
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
