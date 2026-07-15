import { badRequest } from '../errors.js';
import { zonedDateTimeToTs } from '../time.js';
import { createEntry } from '../store/entries.js';
import { createCategory, listCategories } from '../store/categories.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_ERRORS = 20;

// A small hand-written CSV parser (not line-splitting) so quoted fields can
// safely contain commas, escaped quotes ("") and embedded newlines — exactly
// what entriesToCsv (server/report/csv.js) can produce for a note.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // ignore — paired \n (or a lone \r) below ends the row
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Import entries from the same CSV shape entriesToCsv exports
// (Date,Start,End,Duration,Hours,Category,Note — Duration/Hours are derived
// and ignored on import). Categories referenced by name are created
// automatically if they don't already exist. Invalid rows are skipped with a
// reason rather than aborting the whole file; the whole import is one
// transaction for atomicity and speed.
export function importCsv(db, config, text) {
  const rows = parseCsv(String(text ?? '').replace(/^﻿/, ''));
  if (rows.length === 0 || (rows.length === 1 && rows[0].join('').trim() === '')) {
    throw badRequest('The file is empty.');
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const dateCol = header.indexOf('date');
  const startCol = header.indexOf('start');
  const endCol = header.indexOf('end');
  const categoryCol = header.indexOf('category');
  const noteCol = header.indexOf('note');

  if (dateCol === -1 || startCol === -1 || endCol === -1) {
    throw badRequest(
      'This does not look like a Hustlify export — expected at least Date, Start and End columns.',
    );
  }

  const categoryByName = new Map(
    listCategories(db, { includeArchived: true }).map((c) => [c.name.toLowerCase(), c]),
  );

  let imported = 0;
  const errors = [];

  db.transaction(() => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length <= 1 && (row[0] || '').trim() === '') continue; // trailing blank line

      const dateStr = (row[dateCol] || '').trim();
      const startStr = (row[startCol] || '').trim();
      const endStr = (row[endCol] || '').trim();
      const categoryName = categoryCol !== -1 ? (row[categoryCol] || '').trim() : '';
      const note = noteCol !== -1 ? (row[noteCol] || '').trim() : '';

      if (!DATE_RE.test(dateStr) || !TIME_RE.test(startStr) || !TIME_RE.test(endStr)) {
        if (errors.length < MAX_ERRORS) errors.push({ row: i + 1, reason: 'Invalid or missing date/time' });
        continue;
      }

      try {
        const tz = config.app.timezone;
        const startTs = zonedDateTimeToTs(dateStr, startStr, tz);
        let endTs = zonedDateTimeToTs(dateStr, endStr, tz);
        if (endTs <= startTs) endTs += 24 * 3600000; // entry crossed midnight

        let categoryId = null;
        if (categoryName && categoryName.toLowerCase() !== 'uncategorized') {
          let cat = categoryByName.get(categoryName.toLowerCase());
          if (!cat) {
            cat = createCategory(db, { name: categoryName });
            categoryByName.set(categoryName.toLowerCase(), cat);
          }
          categoryId = cat.id;
        }

        createEntry(db, { categoryId, startTs, endTs, note });
        imported++;
      } catch (err) {
        if (errors.length < MAX_ERRORS) errors.push({ row: i + 1, reason: err.message });
      }
    }
  });

  return { imported, skipped: rows.length - 1 - imported, errors };
}
