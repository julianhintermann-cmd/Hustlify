import { badRequest, notFound } from '../errors.js';

const ENTRY_COLUMNS = `
  e.id            AS id,
  e.category_id   AS categoryId,
  c.name          AS categoryName,
  c.color         AS categoryColor,
  e.start_ts      AS startTs,
  e.end_ts        AS endTs,
  e.note          AS note,
  e.created_at    AS createdAt`;

function mapRow(row) {
  if (!row) return row;
  return {
    ...row,
    running: row.endTs === null,
    durationMs: row.endTs === null ? null : row.endTs - row.startTs,
  };
}

function validateTimestamp(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw badRequest(`${field} must be a valid timestamp`);
  return Math.round(n);
}

function normalizeNote(note) {
  const value = String(note ?? '').trim();
  if (value.length > 2000) throw badRequest('Note is too long (max 2000 characters)');
  return value;
}

function resolveCategoryId(db, categoryId) {
  if (categoryId === undefined || categoryId === null || categoryId === '') return null;
  const id = Number(categoryId);
  if (!Number.isInteger(id)) throw badRequest('categoryId must be an integer');
  const exists = db.get(`SELECT id FROM categories WHERE id = ?`, id);
  if (!exists) throw badRequest('Category not found');
  return id;
}

export function getEntry(db, id) {
  const row = db.get(
    `SELECT ${ENTRY_COLUMNS} FROM time_entries e
       LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.id = ?`,
    id,
  );
  if (!row) throw notFound('Entry not found');
  return mapRow(row);
}

// List entries whose start falls inside [startMs, endMs) (both optional),
// optionally filtered by category and a case-insensitive note search.
export function listEntries(db, { startMs, endMs, categoryId, q, limit = 500 } = {}) {
  const clauses = [];
  const params = [];
  if (Number.isFinite(startMs)) {
    clauses.push('e.start_ts >= ?');
    params.push(startMs);
  }
  if (Number.isFinite(endMs)) {
    clauses.push('e.start_ts < ?');
    params.push(endMs);
  }
  if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
    clauses.push('e.category_id = ?');
    params.push(Number(categoryId));
  }
  if (q) {
    clauses.push('e.note LIKE ?');
    params.push(`%${String(q)}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.all(
    `SELECT ${ENTRY_COLUMNS} FROM time_entries e
       LEFT JOIN categories c ON c.id = e.category_id
       ${where}
       ORDER BY e.start_ts DESC
       LIMIT ?`,
    ...params,
    Number(limit),
  );
  return rows.map(mapRow);
}

// Completed entries within [startMs, endMs) in chronological order, used by the
// CSV export and the PDF work report.
export function listForReport(db, { startMs, endMs, categoryId } = {}) {
  const clauses = ['e.end_ts IS NOT NULL'];
  const params = [];
  if (Number.isFinite(startMs)) {
    clauses.push('e.start_ts >= ?');
    params.push(startMs);
  }
  if (Number.isFinite(endMs)) {
    clauses.push('e.start_ts < ?');
    params.push(endMs);
  }
  if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
    clauses.push('e.category_id = ?');
    params.push(Number(categoryId));
  }
  const rows = db.all(
    `SELECT ${ENTRY_COLUMNS} FROM time_entries e
       LEFT JOIN categories c ON c.id = e.category_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY e.start_ts ASC`,
    ...params,
  );
  return rows.map(mapRow);
}

// Create a completed manual entry. Both start and end are required.
export function createEntry(db, { categoryId, startTs, endTs, note } = {}) {
  const start = validateTimestamp(startTs, 'startTs');
  const end = validateTimestamp(endTs, 'endTs');
  if (end <= start) throw badRequest('endTs must be after startTs');
  const catId = resolveCategoryId(db, categoryId);
  const cleanNote = normalizeNote(note);
  const info = db.run(
    `INSERT INTO time_entries (category_id, start_ts, end_ts, note, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    catId,
    start,
    end,
    cleanNote,
    Date.now(),
  );
  return getEntry(db, Number(info.lastInsertRowid));
}

export function updateEntry(db, id, { categoryId, startTs, endTs, note } = {}) {
  const existing = getEntry(db, id);
  const start = startTs === undefined ? existing.startTs : validateTimestamp(startTs, 'startTs');
  // A running entry (endTs === null) may be edited without providing an end.
  let end = existing.endTs;
  if (endTs !== undefined) {
    end = endTs === null ? null : validateTimestamp(endTs, 'endTs');
  }
  if (end !== null && end <= start) throw badRequest('endTs must be after startTs');
  const catId =
    categoryId === undefined ? existing.categoryId : resolveCategoryId(db, categoryId);
  const cleanNote = note === undefined ? existing.note : normalizeNote(note);
  db.run(
    `UPDATE time_entries SET category_id = ?, start_ts = ?, end_ts = ?, note = ? WHERE id = ?`,
    catId,
    start,
    end,
    cleanNote,
    id,
  );
  return getEntry(db, id);
}

export function deleteEntry(db, id) {
  getEntry(db, id);
  db.run(`DELETE FROM time_entries WHERE id = ?`, id);
}
