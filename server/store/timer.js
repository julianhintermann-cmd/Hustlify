import { conflict, badRequest } from '../errors.js';
import { getEntry } from './entries.js';

// The running timer is simply the single time entry whose end_ts is NULL.
export function getRunning(db) {
  const row = db.get(`SELECT id FROM time_entries WHERE end_ts IS NULL LIMIT 1`);
  return row ? getEntry(db, row.id) : null;
}

// Start the timer by creating an open-ended entry. Only one may run at a time.
export function startTimer(db, { categoryId, note, startTs } = {}) {
  if (getRunning(db)) throw conflict('A timer is already running');

  let catId = null;
  if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
    const id = Number(categoryId);
    if (!Number.isInteger(id)) throw badRequest('categoryId must be an integer');
    const exists = db.get(`SELECT id FROM categories WHERE id = ?`, id);
    if (!exists) throw badRequest('Category not found');
    catId = id;
  }

  const start = startTs ? Math.round(Number(startTs)) : Date.now();
  const cleanNote = String(note ?? '').trim().slice(0, 2000);
  const info = db.run(
    `INSERT INTO time_entries (category_id, start_ts, end_ts, note, created_at)
     VALUES (?, ?, NULL, ?, ?)`,
    catId,
    start,
    cleanNote,
    Date.now(),
  );
  return getEntry(db, Number(info.lastInsertRowid));
}

// Stop the running timer, stamping its end time. Returns the completed entry.
export function stopTimer(db) {
  const running = getRunning(db);
  if (!running) throw conflict('No timer is running');
  const end = Date.now();
  // Guard against a zero/negative duration if start and stop land on the same ms.
  const safeEnd = end <= running.startTs ? running.startTs + 1000 : end;
  db.run(`UPDATE time_entries SET end_ts = ? WHERE id = ?`, safeEnd, running.id);
  return getEntry(db, running.id);
}
