import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db.js';
import { createApp } from '../app.js';
import { DEFAULTS } from '../config.js';

// The restore feature rewrites the real database file on disk, so — unlike
// the rest of the suite — these tests need a genuine temp file rather than
// ':memory:', with process.env.DB_PATH pointed at it (routes.js resolves the
// live path via config.js's dbPath() at request time).
let dbFile;
let db;
let app;

beforeEach(() => {
  dbFile = path.join(os.tmpdir(), `hustlify-restore-test-${crypto.randomUUID()}.db`);
  process.env.DB_PATH = dbFile;
  db = openDatabase(dbFile);
  app = createApp({ db, config: structuredClone(DEFAULTS), secret: 'test-secret' });
});

afterEach(() => {
  db.close();
  delete process.env.DB_PATH;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(dbFile + suffix);
    } catch {
      // already gone
    }
  }
});

function postBackup(buffer) {
  return request(app)
    .post('/api/restore')
    .set('Content-Type', 'application/octet-stream')
    .send(buffer);
}

describe('restore', () => {
  it('rejects a file that is not SQLite at all', async () => {
    const res = await postBackup(Buffer.from('just some random bytes, not a database'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a sqlite database/i);
  });

  it('rejects a genuine SQLite file with the wrong schema', async () => {
    const otherPath = path.join(os.tmpdir(), `hustlify-unrelated-${crypto.randomUUID()}.db`);
    const other = new DatabaseSync(otherPath);
    other.exec('CREATE TABLE foo (id INTEGER)');
    other.close();
    const buffer = fs.readFileSync(otherPath);
    fs.unlinkSync(otherPath);

    const res = await postBackup(buffer);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not look like a hustlify backup/i);
  });

  it('rejects an empty upload', async () => {
    const res = await postBackup(Buffer.alloc(0));
    expect(res.status).toBe(400);
  });

  it('restores a valid backup in place, replacing data added after it was taken', async () => {
    await request(app).post('/api/categories').send({ name: 'Original', color: '#3b82f6' });

    const backupRes = await request(app)
      .get('/api/backup.db')
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(backupRes.status).toBe(200);

    await request(app).post('/api/categories').send({ name: 'Added later', color: '#ef4444' });
    const beforeRestore = await request(app).get('/api/categories');
    expect(beforeRestore.body).toHaveLength(2);

    const restoreRes = await postBackup(backupRes.body);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.ok).toBe(true);

    const afterRestore = await request(app).get('/api/categories');
    expect(afterRestore.body).toHaveLength(1);
    expect(afterRestore.body[0].name).toBe('Original');
  });

  it('keeps working normally after a restore (handle is swapped in place)', async () => {
    await request(app).post('/api/categories').send({ name: 'A', color: '#3b82f6' });
    const backupRes = await request(app)
      .get('/api/backup.db')
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    await postBackup(backupRes.body);

    // The app should still be fully functional post-restore.
    const created = await request(app).post('/api/categories').send({ name: 'B', color: '#10b981' });
    expect(created.status).toBe(201);
    const list = await request(app).get('/api/categories');
    expect(list.body.map((c) => c.name).sort()).toEqual(['A', 'B']);
  });
});
