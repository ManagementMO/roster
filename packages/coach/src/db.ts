import Database from "better-sqlite3";

export type CoachDb = Database.Database;

const SCHEMA_VERSION = "1";

/**
 * Open (and migrate) the coach database. Pass ":memory:" for tests.
 * WAL keeps concurrent reader/writer behavior sane when the router and CLI
 * touch the same file; both live on the user's machine only.
 */
export function openCoachDb(path: string): CoachDb {
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
}
