import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Ordered list of migrations. The array index + 1 is the schema version, tracked
// through SQLite's built-in PRAGMA user_version. Adding a migration is as simple
// as appending a new function — existing databases upgrade automatically at boot.
const MIGRATIONS = [
  (db) => {
    db.exec(`
      CREATE TABLE categories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        color      TEXT NOT NULL DEFAULT '#8b5cf6',
        archived   INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE time_entries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        start_ts    INTEGER NOT NULL,
        end_ts      INTEGER,
        note        TEXT NOT NULL DEFAULT '',
        created_at  INTEGER NOT NULL
      );

      CREATE INDEX idx_entries_start ON time_entries(start_ts);
      CREATE INDEX idx_entries_category ON time_entries(category_id);
    `);
  },
];

// node:sqlite exposes a low-level API. This thin wrapper adds the couple of
// conveniences the rest of the server relies on (schema version + transactions)
// while keeping the familiar prepare/get/all/run/exec surface.
class Db {
  constructor(handle) {
    this.handle = handle;
  }

  prepare(sql) {
    return this.handle.prepare(sql);
  }

  exec(sql) {
    return this.handle.exec(sql);
  }

  get(sql, ...params) {
    return this.handle.prepare(sql).get(...params);
  }

  all(sql, ...params) {
    return this.handle.prepare(sql).all(...params);
  }

  run(sql, ...params) {
    return this.handle.prepare(sql).run(...params);
  }

  get userVersion() {
    return this.handle.prepare('PRAGMA user_version').get().user_version;
  }

  set userVersion(v) {
    this.handle.exec(`PRAGMA user_version = ${Number(v)}`);
  }

  // Run fn inside a transaction, committing on success and rolling back on error.
  transaction(fn) {
    this.handle.exec('BEGIN');
    try {
      const result = fn();
      this.handle.exec('COMMIT');
      return result;
    } catch (err) {
      this.handle.exec('ROLLBACK');
      throw err;
    }
  }

  close() {
    this.handle.close();
  }
}

function runMigrations(db) {
  for (let version = db.userVersion; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      MIGRATIONS[version](db.handle);
      db.userVersion = version + 1;
    });
  }
}

// Open (and if necessary create + migrate) the SQLite database at the given path.
// Pass ':memory:' for tests.
export function openDatabase(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const handle = new DatabaseSync(file);
  const db = new Db(handle);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}
