import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { backup as sqliteBackup } from 'node:sqlite';

// Produce a consistent, point-in-time copy of the live database (safe even
// while WAL writes are in flight) at a temporary path, and return that path.
// The caller is responsible for streaming and then deleting the file.
export async function createBackupFile(db) {
  const tmpPath = path.join(os.tmpdir(), `hustlify-backup-${crypto.randomUUID()}.db`);
  await sqliteBackup(db.handle, tmpPath);
  return tmpPath;
}

export function cleanupBackupFile(tmpPath) {
  fs.unlink(tmpPath, () => {});
}
