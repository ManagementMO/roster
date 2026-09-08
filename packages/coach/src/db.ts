import fs from "node:fs";
import Database from "better-sqlite3";

export type CoachDb = Database.Database;

/**
 * Schema version of the coach DB. Migrations here are deliberately v1-simple:
 * additive and FORWARD-ONLY. Every statement below is `CREATE TABLE IF NOT
 * EXISTS`, so opening an older DB only adds missing tables — there is, by design
 * for now, NO column ALTER, NO down-migration, and NO version reconciliation
 * (the stored `schema_version` is written once via INSERT OR IGNORE and never
 * re-read). That is safe while this stays "1" (the only shipped schema). A
 * BREAKING bump MUST add: a read-back of `meta.schema_version`, explicit
 * per-version upgrade steps, and a guard that REFUSES (rather than silently
 * corrupts) a DB written by a newer binary. Disclosed here rather than
 * discovered in the field (DEF-7); tracked as a pre-scale P-item.
 */
const SCHEMA_VERSION = "1";

/**
 * Create (or tighten) the database file owner-only BEFORE SQLite opens it.
 *
 * The Coach DB is not just counters: `capability` stores every tool name and
 * description and whole SKILL.md bodies, plus the drift ledger and outcome
 * history — an inventory of the user's entire toolchain. SQLite creates the
 * file with the process umask (0644 by default) and derives the `-wal`/`-shm`
 * sibling permissions from the main file, so pre-creating it at 0600 covers all
 * three (round-6 review R6-01). Best effort by design: Windows has no POSIX
 * mode bits, and a permission hiccup must never stop the router from serving.
 */
function ensureOwnerOnlyDbFile(file: string): void {
  if (file === ":memory:" || file === "") return;
  try {
    fs.closeSync(fs.openSync(file, "a", 0o600));
    const current = fs.statSync(file).mode & 0o777;
    if ((current & 0o077) !== 0) fs.chmodSync(file, current & 0o700);
  } catch {
    // Unwritable path, exotic filesystem, or Windows — the open below reports
    // any real problem with a far better error than we could here.
  }
}

/**
 * Open (and migrate) the coach database. Pass ":memory:" for tests.
 * WAL keeps concurrent reader/writer behavior sane when the router and CLI
 * touch the same file; both live on the user's machine only.
 */
export function openCoachDb(path: string): CoachDb {
  ensureOwnerOnlyDbFile(path);
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Every client session spawns its own `roster serve`; several processes
  // share this file. Without a busy timeout, a concurrent writer surfaces as
  // SQLITE_BUSY crashes instead of a short wait.
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

/** Create the coach schema if absent — additive & idempotent (see SCHEMA_VERSION). */
function migrate(db: CoachDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS capability(
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('tool','skill')),
      source TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      input_schema TEXT,
      output_schema TEXT,
      body TEXT,
      path TEXT,
      def_hash TEXT NOT NULL,
      quarantined INTEGER NOT NULL DEFAULT 0,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );

    -- The "name" column carries "<source> <tool>" so a user searching "memory"
    -- or a server's own name finds its tools even when descriptions never say
    -- the word (empty-draft bug in default lexical mode).
    CREATE VIRTUAL TABLE IF NOT EXISTS capability_fts USING fts5(id UNINDEXED, name, description, body);

    CREATE TABLE IF NOT EXISTS suggestion(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      session TEXT NOT NULL,
      failed_capability TEXT NOT NULL,
      suggested_capability TEXT NOT NULL,
      taken INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS outcome(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      session TEXT NOT NULL,
      source TEXT NOT NULL,
      capability TEXT NOT NULL,
      need_hash TEXT,
      args_hash TEXT,
      intent_cat TEXT,
      class TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      soft_fail INTEGER NOT NULL DEFAULT 0,
      substituted INTEGER NOT NULL DEFAULT 0,
      explored INTEGER NOT NULL DEFAULT 0,
      spec_ver TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outcome_session ON outcome(session, id);
    CREATE INDEX IF NOT EXISTS idx_outcome_capability ON outcome(capability, ts);

    CREATE TABLE IF NOT EXISTS rating(
      capability TEXT NOT NULL,
      category TEXT NOT NULL,
      n INTEGER NOT NULL,
      successes INTEGER NOT NULL,
      wilson_lb REAL NOT NULL,
      p50_ms INTEGER,
      p95_ms INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(capability, category)
    );

    CREATE TABLE IF NOT EXISTS drift_event(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      capability TEXT NOT NULL,
      old_hash TEXT NOT NULL,
      new_hash TEXT NOT NULL
    );

    -- Tombstone for pruned capabilities: carries the last-seen definition hash
    -- (and quarantine state) forward so a tool that is REMOVED and later
    -- RE-ADDED with a changed definition still raises a drift event instead of
    -- slipping back in as "new" (drift-evasion via remove/re-add).
    CREATE TABLE IF NOT EXISTS removed_capability(
      id TEXT PRIMARY KEY,
      def_hash TEXT NOT NULL,
      quarantined INTEGER NOT NULL DEFAULT 0,
      last_drift_ts INTEGER,
      removed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vec(
      capability TEXT PRIMARY KEY,
      dims INTEGER NOT NULL,
      base BLOB NOT NULL,
      adj BLOB,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS need_vec(
      need_hash TEXT PRIMARY KEY,
      dims INTEGER NOT NULL,
      vec BLOB NOT NULL,
      ts INTEGER NOT NULL
    );
  `);
  db.prepare("INSERT OR IGNORE INTO meta(key, value) VALUES('schema_version', ?)").run(
    SCHEMA_VERSION,
  );
  // Additive column migration (forward-only, idempotent). The capability table
  // predates safety/contract metadata; a change to `annotations`
  // (destructiveHint/readOnlyHint/…), `execution`, or `title` is drift a client
  // acts on, so it must be persisted and hashed. ADD COLUMN is cheap and only
  // appends; a DB written by a newer binary already has these, and one written
  // by an older binary gains them here with NULL defaults (== "absent").
  addColumnIfMissing(db, "capability", "title", "TEXT");
  addColumnIfMissing(db, "capability", "annotations", "TEXT");
  addColumnIfMissing(db, "capability", "execution", "TEXT");
}

/** Idempotent `ALTER TABLE ADD COLUMN` — a no-op when the column already exists. */
function addColumnIfMissing(db: CoachDb, table: string, column: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}
