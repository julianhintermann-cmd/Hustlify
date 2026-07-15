import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { badRequest } from '../errors.js';

const SQLITE_MAGIC = 'SQLite format 3\0';
const REQUIRED_TABLES = ['categories', 'time_entries'];
const REQUIRED_ENTRY_COLUMNS = ['id', 'category_id', 'start_ts', 'end_ts', 'note', 'created_at'];

// Validate that `buffer` is a genuine Hustlify backup: a real SQLite file
// containing the tables and columns this app expects. Throws a friendly
// HttpError (400) describing exactly what's wrong otherwise.
function assertValidBackup(buffer) {
  if (buffer.length < 16 || buffer.toString('latin1', 0, 16) !== SQLITE_MAGIC) {
    throw badRequest('This file is not a SQLite database.');
  }

  const tmpPath = path.join(os.tmpdir(), `hustlify-restore-check-${crypto.randomUUID()}.db`);
  fs.writeFileSync(tmpPath, buffer);
  let check;
  try {
    check = new DatabaseSync(tmpPath, { readOnly: true });
    const tables = check
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r) => r.name);
    const missingTables = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    if (missingTables.length) {
      throw badRequest(
        `This does not look like a Hustlify backup (missing table${missingTables.length > 1 ? 's' : ''}: ${missingTables.join(', ')}).`,
      );
    }
    const entryColumns = check.prepare(`PRAGMA table_info(time_entries)`).all().map((c) => c.name);
    const missingColumns = REQUIRED_ENTRY_COLUMNS.filter((c) => !entryColumns.includes(c));
    if (missingColumns.length) {
      throw badRequest('This does not look like a Hustlify backup (unexpected table structure).');
    }
  } catch (err) {
    if (err.status) throw err; // our own HttpError — rethrow as-is
    throw badRequest('This file could not be opened as a SQLite database.');
  } finally {
    check?.close();
    fs.unlinkSync(tmpPath);
  }
}

// Validate an uploaded backup and, if valid, replace the live database with
// it in place (no process restart needed — see Db#replaceFile).
export function restoreFromBuffer(db, buffer, dbPath) {
  assertValidBackup(buffer);
  db.replaceFile(dbPath, buffer);
}
