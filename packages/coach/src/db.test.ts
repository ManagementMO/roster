import { closeSync, existsSync, mkdtempSync, openSync, readSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CapabilityEntry } from "@rosterhq/shared";
import { describe, expect, it } from "vitest";
import { type CoachDb, openCoachDb } from "./db.js";
import { normalize } from "./oats.js";
import { CoachStore } from "./store.js";
import { blobToVec, vecToBlob } from "./util.js";

/**
 * DRIVER CONTRACT TESTS (W1).
 *
 * The rest of the suite exercises coach behaviour THROUGH better-sqlite3 and
 * therefore cannot tell a working native driver from a broken one. Measured on
 * this tree: injecting either of the two regressions a native-driver rewrite
 * typically causes — (a) every BLOB column returned as a plain `Uint8Array`
 * instead of a `Buffer`, (b) `PRAGMA journal_mode = WAL` silently no-opping so
 * `openCoachDb` lands in rollback-journal ("delete") mode — left the suite at
 * 369/369 green. The cross-process contention test in store.test.ts does not
 * close the gap: it asserts worker exit codes and the final aggregate, and with
 * `busy_timeout = 5000` both hold WITHOUT WAL.
 *
 * These tests pin the two driver-boundary properties `openCoachDb`/`CoachStore`
 * are written against, so a better-sqlite3 major upgrade that changes either one
 * is a RED test rather than a silent behaviour change.
 */

const tool = (id: string): CapabilityEntry => ({
  id,
  kind: "tool",
  source: id.split("__")[0] ?? "src",
  name: id.split("__")[1] ?? "t",
  description: "d",
  inputSchema: { type: "object" },
});

/**
 * SQLite records the journal format in its own file header: bytes 18 (write
 * version) and 19 (read version) are 1 for a rollback journal and 2 for WAL
 * (https://sqlite.org/fileformat.html#file_format_version_numbers). Reading
 * them with `fs` is deliberately driver-INDEPENDENT: a driver that no-ops the
 * WAL pragma but still answers `PRAGMA journal_mode` honestly, or one that lies
 * about both, is caught here either way.
 */
function fileFormatVersions(file: string): { write: number; read: number } {
  const header = Buffer.alloc(20);
  const fd = openSync(file, "r");
  try {
    const n = readSync(fd, header, 0, 20, 0);
    expect(n).toBe(20); // a migrated DB always has a full 100-byte header
  } finally {
    closeSync(fd);
  }
  return { write: header[18] as number, read: header[19] as number };
}

function withTempDb(fn: (dbPath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "coach-driver-"));
  try {
    fn(join(dir, "coach.db"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("openCoachDb journal mode", () => {
  it("really puts a file-backed DB in WAL — per the driver AND on disk", () => {
    // Scoped to a FILE db on purpose: an in-memory database cannot be WAL
    // (`journal_mode` reports "memory"), so the `:memory:` DBs the rest of the
    // suite uses could never have caught this.
    withTempDb((dbPath) => {
      const db = openCoachDb(dbPath);
      try {
        expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
        // Side effect: migrate() writes, so the write-ahead log must exist.
        expect(existsSync(`${dbPath}-wal`)).toBe(true);
        expect(fileFormatVersions(dbPath)).toEqual({ write: 2, read: 2 });
      } finally {
        db.close();
      }
    });
  });

  it("delivers WAL's readers-never-block-on-a-writer behaviour", () => {
    // This is the property db.ts claims ("WAL keeps concurrent reader/writer
    // behavior sane when the router and CLI touch the same file"). In WAL a
    // reader sees the last committed snapshot while a writer holds the write
    // lock; under a rollback journal the same read fails SQLITE_BUSY.
    withTempDb((dbPath) => {
      const writer = openCoachDb(dbPath);
      // Opened BEFORE the writer takes the lock: its own migrate() writes.
      const reader = openCoachDb(dbPath);
      // Fail fast instead of waiting out openCoachDb's busy_timeout = 5000.
      reader.pragma("busy_timeout = 200");
      try {
        writer.exec("BEGIN EXCLUSIVE");
        try {
          expect(reader.prepare("SELECT count(*) AS c FROM meta").get()).toEqual({ c: 1 });
        } finally {
          writer.exec("ROLLBACK");
        }
      } finally {
        reader.close();
        writer.close();
      }
    });
  });
});

describe("vector BLOB storage", () => {
  const CAP = "s__embed";
  // 3-4-5 triangle: normalize() divides by an exact 5, so the stored payload is
  // whatever float32 rounding of 0.6/0.8 the platform does — compared exactly
  // against normalize()'s own output, never against a decimal literal.
  const INPUT = new Float32Array([3, 4, 0]);

  const seeded = (db: CoachDb): CoachStore => {
    const store = new CoachStore(db);
    store.upsertCapabilities([tool(CAP)]);
    expect(store.storeBaseVec(CAP, INPUT)).toBe(true);
    return store;
  };

  it("round-trips the exact float32 payload through the real store API", () => {
    const db = openCoachDb(":memory:");
    const store = seeded(db);
    const expected = normalize(INPUT);

    const loaded = store.loadVecs().get(CAP);
    expect(loaded).toBeInstanceOf(Float32Array);
    // Bit-exact, element by element — not toBeCloseTo. A driver that truncated,
    // re-ordered or re-encoded the blob would change these values.
    expect(Array.from(loaded as Float32Array)).toEqual(Array.from(expected));

    const row = db.prepare(`SELECT dims, base FROM vec WHERE capability = ?`).get(CAP) as {
      dims: number;
      base: Buffer;
    };
    // blobToVec is length-strict: byteLength must be exactly dims * 4, or every
    // read of this row throws instead of ranking.
    expect(row.dims).toBe(INPUT.length);
    expect(row.base.byteLength).toBe(INPUT.length * 4);
    expect(Array.from(blobToVec(row.base, row.dims))).toEqual(Array.from(expected));

    // runOats' compare-and-delete re-BINDS a blob it just read
    // (`... AND vec = ?`), so a value read out must still match its own row.
    const rebound = db
      .prepare(`SELECT 1 AS ok FROM vec WHERE capability = ? AND base = ?`)
      .get(CAP, row.base);
    expect(rebound).toEqual({ ok: 1 });

    store.close();
  });

  it("returns BLOB columns as Buffer — the type the row contracts declare", () => {
    // store.ts declares `VecRow.base: Buffer`, `VecRow.adj: Buffer | null` and
    // need_vec's `{ dims: number; vec: Buffer }`. HONEST SCOPE: today's readers
    // survive a Uint8Array — blobToVec's `Buffer.from(blob)` copy accepts any
    // typed array, and better-sqlite3 12.11.1 also accepts one as a bind
    // parameter (both measured). So this asserts the DECLARED type at the driver
    // boundary, not a crash that happens today: it exists so a driver swap that
    // silently invalidates those declarations is a reviewed decision instead of
    // an unnoticed one, and so the little-endian float32 layout below is pinned
    // on a value the code is entitled to call Buffer methods on.
    const db = openCoachDb(":memory:");
    const store = seeded(db);
    const expected = normalize(INPUT);

    const vecRow = db.prepare(`SELECT base, adj FROM vec WHERE capability = ?`).get(CAP) as {
      base: Buffer;
      adj: Buffer | null;
    };
    expect(Buffer.isBuffer(vecRow.base)).toBe(true);
    expect(vecRow.adj).toBeNull();
    for (let i = 0; i < INPUT.length; i++) {
      expect(vecRow.base.readFloatLE(i * 4)).toBe(expected[i]);
    }

    store.storeNeedVec("need-hash", INPUT);
    const needRow = db.prepare(`SELECT vec FROM need_vec WHERE need_hash = ?`).get("need-hash") as {
      vec: Buffer;
    };
    expect(Buffer.isBuffer(needRow.vec)).toBe(true);
    expect(needRow.vec.byteLength).toBe(INPUT.length * 4);

    store.close();
  });

  it("decodes a 4-byte-MISALIGNED blob view (blobToVec's defensive copy)", () => {
    // Why the readers above tolerate a foreign typed array at all: blobToVec
    // copies before viewing ("ensure alignment"). Drop that copy and a blob
    // whose byteOffset is not a multiple of 4 throws
    // "start offset of Float32Array should be a multiple of 4" — which a driver
    // handing back pooled/offset views can produce for arbitrary rows.
    const misaligned = Buffer.from(new ArrayBuffer(13), 1, 12);
    expect(misaligned.byteOffset % 4).not.toBe(0);
    misaligned.set(vecToBlob(new Float32Array([1, 2, 3])));
    expect(Array.from(blobToVec(misaligned, 3))).toEqual([1, 2, 3]);
  });
});
