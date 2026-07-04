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

    CREATE VIRTUAL TABLE IF NOT EXISTS capability_fts USING fts5(id, name, description, body);

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
