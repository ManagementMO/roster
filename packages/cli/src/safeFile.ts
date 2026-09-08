import fs from "node:fs";
import path from "node:path";

const NO_FOLLOW =
  (fs.constants as typeof fs.constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ??
  0;

/**
 * Read an existing regular file through the descriptor that was validated.
 *
 * The backup/eject trust path cannot use `lstat(path)` followed by
 * `readFile(path)`: another process can replace the path between those calls.
 * POSIX gets O_NOFOLLOW as the first line of defence; every platform also
 * verifies the opened descriptor against the post-open path and parent, then
 * checks that the file did not change while it was read.
 */
export function readRegularFileNoFollow(
  target: string,
  options: { attempts?: number } = {},
): Buffer {
  const attempts = options.attempts ?? 1;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 16) {
    throw new Error("integrity read attempts must be an integer from 1 through 16");
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return readRegularFileOnce(target);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ROSTER_FILE_CHANGED" ||
        attempt === attempts
      ) {
        throw error;
      }
    }
  }
  throw new Error("integrity read exhausted without a result");
}

function readRegularFileOnce(target: string): Buffer {
  const parent = path.dirname(target);
  const parentBefore = fs.lstatSync(parent, { bigint: true });
  if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink()) {
    throw new Error("integrity file parent is not a regular directory");
  }

  const fd = fs.openSync(target, fs.constants.O_RDONLY | NO_FOLLOW);
  try {
    const openedBefore = fs.fstatSync(fd, { bigint: true });
    const namedAfterOpen = fs.lstatSync(target, { bigint: true });
    const parentAfterOpen = fs.lstatSync(parent, { bigint: true });
    if (
      !openedBefore.isFile() ||
      !namedAfterOpen.isFile() ||
      namedAfterOpen.isSymbolicLink() ||
      !sameIdentity(openedBefore, namedAfterOpen) ||
      !sameDirectory(parentBefore, parentAfterOpen)
    ) {
      throw fileChanged("integrity file changed while being opened");
    }

    const bytes = fs.readFileSync(fd);
    const openedAfter = fs.fstatSync(fd, { bigint: true });
    const parentAfterRead = fs.lstatSync(parent, { bigint: true });
    if (
      !sameStableFile(openedBefore, openedAfter) ||
      !sameDirectory(parentBefore, parentAfterRead)
    ) {
      throw fileChanged("integrity file changed while being read");
    }
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function fileChanged(message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code: "ROSTER_FILE_CHANGED" });
}

function sameIdentity(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameDirectory(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return (
    right.isDirectory() &&
    !right.isSymbolicLink() &&
    sameIdentity(left, right)
  );
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
