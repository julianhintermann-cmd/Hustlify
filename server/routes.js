import express from 'express';
import { HttpError } from './errors.js';
import { publicSettings, dbPath } from './config.js';
import { zonedDayStart, addDays, localDateString } from './time.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './store/categories.js';
import {
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  listForReport,
} from './store/entries.js';
import { getRunning, startTimer, stopTimer } from './store/timer.js';
import { computeStats, heatmapData } from './store/stats.js';
import { entriesToCsv } from './report/csv.js';
import { generateReport } from './report/pdf.js';
import { createBackupFile, cleanupBackupFile } from './store/backup.js';
import { restoreFromBuffer } from './store/restore.js';
import { importCsv } from './report/csv-import.js';
import { verifyPassword, requireAuth, setAuthCookie, clearAuthCookie } from './auth.js';

// Wrap a synchronous handler so thrown HttpErrors become clean JSON responses.
function handle(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
      } else {
        console.error('[api] Unhandled error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}

// Same as handle(), but for an async route handler.
function handleAsync(fn) {
  return (req, res) => {
    fn(req, res).catch((err) => {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
      } else {
        console.error('[api] Unhandled error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  };
}

// Translate ?from=YYYY-MM-DD&to=YYYY-MM-DD into a millisecond window. Both are
// optional; missing bounds mean "unbounded".
function parseRange(query, tz) {
  const out = {};
  if (query.from) out.startMs = zonedDayStart(String(query.from), tz);
  if (query.to) out.endMs = zonedDayStart(addDays(String(query.to), 1), tz);
  return out;
}

export function createApiRouter({ db, config }) {
  const router = express.Router();
  const tz = config.app.timezone;

  // ---- Open routes (no auth) ----------------------------------------------
  router.get('/settings', handle((req, res) => {
    res.json(publicSettings(config));
  }));

  router.post('/login', handle((req, res) => {
    if (!config.auth.password) return res.json({ ok: true });
    if (!verifyPassword(req.body?.password, config.auth.password)) {
      throw new HttpError(401, 'Incorrect password');
    }
    setAuthCookie(res);
    res.json({ ok: true });
  }));

  router.post('/logout', handle((req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  }));

  // ---- Everything below requires auth when a password is configured --------
  router.use(requireAuth(config));

  // Categories
  router.get('/categories', handle((req, res) => {
    res.json(listCategories(db, { includeArchived: req.query.all === 'true' }));
  }));
  router.post('/categories', handle((req, res) => {
    res.status(201).json(createCategory(db, req.body));
  }));
  router.patch('/categories/:id', handle((req, res) => {
    res.json(updateCategory(db, Number(req.params.id), req.body));
  }));
  router.delete('/categories/:id', handle((req, res) => {
    deleteCategory(db, Number(req.params.id));
    res.json({ ok: true });
  }));

  // Entries
  router.get('/entries', handle((req, res) => {
    const range = parseRange(req.query, tz);
    res.json(
      listEntries(db, {
        ...range,
        categoryId: req.query.category_id,
        q: req.query.q,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    );
  }));
  router.post('/entries', handle((req, res) => {
    res.status(201).json(createEntry(db, req.body));
  }));
  router.patch('/entries/:id', handle((req, res) => {
    res.json(updateEntry(db, Number(req.params.id), req.body));
  }));
  router.delete('/entries/:id', handle((req, res) => {
    deleteEntry(db, Number(req.params.id));
    res.json({ ok: true });
  }));

  // Timer
  router.get('/timer', handle((req, res) => {
    res.json({ running: getRunning(db) });
  }));
  router.post('/timer/start', handle((req, res) => {
    res.status(201).json(startTimer(db, req.body || {}));
  }));
  router.post('/timer/stop', handle((req, res) => {
    res.json(stopTimer(db));
  }));

  // Statistics
  router.get('/stats', handle((req, res) => {
    res.json(computeStats(db, config, { range: req.query.range === 'month' ? 'month' : 'week' }));
  }));

  // Year heatmap + current streak
  router.get('/heatmap', handle((req, res) => {
    res.json(heatmapData(db, config));
  }));

  // CSV export
  router.get('/export.csv', handle((req, res) => {
    const range = parseRange(req.query, tz);
    const entries = listForReport(db, { ...range, categoryId: req.query.category_id });
    const csv = entriesToCsv(entries, tz);
    const stamp = localDateString(Date.now(), tz);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hustlify-${stamp}.csv"`);
    res.send(csv);
  }));

  // CSV import — accepts the same shape entriesToCsv exports.
  router.post(
    '/import.csv',
    express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '20mb' }),
    handle((req, res) => {
      if (typeof req.body !== 'string' || !req.body.trim()) {
        throw new HttpError(400, 'No file uploaded');
      }
      res.json(importCsv(db, config, req.body));
    }),
  );

  // PDF work report
  router.get('/report.pdf', handle((req, res) => {
    const range = parseRange(req.query, tz);
    const entries = listForReport(db, { ...range, categoryId: req.query.category_id });
    const stamp = localDateString(Date.now(), tz);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="work-report-${stamp}.pdf"`);
    generateReport(res, {
      entries,
      config,
      fromDate: req.query.from ? String(req.query.from) : (entries[0] ? localDateString(entries[0].startTs, tz) : stamp),
      toDate: req.query.to ? String(req.query.to) : stamp,
    });
  }));

  // Full database backup (a consistent point-in-time copy, safe under WAL)
  router.get('/backup.db', handleAsync(async (req, res) => {
    const tmpPath = await createBackupFile(db);
    const stamp = localDateString(Date.now(), tz);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="hustlify-backup-${stamp}.db"`);
    res.sendFile(tmpPath, (err) => {
      cleanupBackupFile(tmpPath);
      if (err && !res.headersSent) res.status(500).json({ error: 'Backup failed' });
    });
  }));

  // Restore the database from an uploaded backup file. Validated against the
  // expected schema before anything is touched; applied in place, no restart.
  router.post(
    '/restore',
    express.raw({ type: 'application/octet-stream', limit: '200mb' }),
    handle((req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new HttpError(400, 'No file uploaded');
      }
      restoreFromBuffer(db, req.body, dbPath());
      res.json({ ok: true });
    }),
  );

  return router;
}
