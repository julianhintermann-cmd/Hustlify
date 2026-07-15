import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../db.js';
import { createEntry, listForReport } from '../store/entries.js';
import { createCategory, listCategories } from '../store/categories.js';
import { entriesToCsv } from '../report/csv.js';
import { importCsv } from '../report/csv-import.js';
import { DEFAULTS } from '../config.js';

const H = 60 * 60 * 1000;

function baseConfig() {
  const config = structuredClone(DEFAULTS);
  config.app.timezone = 'UTC';
  return config;
}

let db;
beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('importCsv', () => {
  it('rejects an empty file', () => {
    expect(() => importCsv(db, baseConfig(), '')).toThrow(/empty/i);
  });

  it('rejects a file missing the expected columns', () => {
    expect(() => importCsv(db, baseConfig(), 'Foo,Bar\n1,2')).toThrow(/does not look like/i);
  });

  it('imports nothing from a header-only file', () => {
    const result = importCsv(db, baseConfig(), 'Date,Start,End,Duration,Hours,Category,Note');
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(listForReport(db, {})).toHaveLength(0);
  });

  it('round-trips an export back into a fresh database, auto-creating categories', () => {
    const dev = createCategory(db, { name: 'Deep Work', color: '#8b5cf6' });
    createEntry(db, {
      categoryId: dev.id,
      startTs: Date.UTC(2026, 6, 13, 9, 0),
      endTs: Date.UTC(2026, 6, 13, 11, 30),
      note: 'Architecture design, with a comma',
    });
    createEntry(db, {
      startTs: Date.UTC(2026, 6, 14, 8, 0),
      endTs: Date.UTC(2026, 6, 14, 9, 0),
      note: 'Plain note',
    });
    const csv = entriesToCsv(listForReport(db, {}), 'UTC');

    const fresh = openDatabase(':memory:');
    const result = importCsv(fresh, baseConfig(), csv);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);

    const cats = listCategories(fresh, { includeArchived: true });
    expect(cats.map((c) => c.name)).toEqual(['Deep Work']);

    const entries = listForReport(fresh, {});
    expect(entries).toHaveLength(2);
    const withNote = entries.find((e) => e.note.includes('comma'));
    expect(withNote.categoryName).toBe('Deep Work');
    expect(withNote.durationMs).toBe(2.5 * H);
  });

  it('reuses an existing category by name instead of creating a duplicate', () => {
    createCategory(db, { name: 'Client Work', color: '#fb923c' });
    const csv = [
      'Date,Start,End,Duration,Hours,Category,Note',
      '2026-07-15,09:00,10:00,1:00,1,Client Work,hello',
    ].join('\r\n');

    importCsv(db, baseConfig(), csv);
    const cats = listCategories(db, { includeArchived: true });
    expect(cats.filter((c) => c.name === 'Client Work')).toHaveLength(1);
  });

  it('skips malformed rows with a reason but still imports the valid ones', () => {
    const csv = [
      'Date,Start,End,Duration,Hours,Category,Note',
      '2026-07-15,09:00,10:00,1:00,1,,good row',
      'not-a-date,09:00,10:00,1:00,1,,bad date',
      '2026-07-15,25:99,10:00,1:00,1,,bad time',
    ].join('\r\n');

    const result = importCsv(db, baseConfig(), csv);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].reason).toMatch(/invalid or missing/i);
  });

  it('handles an entry that crosses midnight', () => {
    const csv = [
      'Date,Start,End,Duration,Hours,Category,Note',
      '2026-07-15,23:00,01:00,2:00,2,,overnight',
    ].join('\r\n');

    const result = importCsv(db, baseConfig(), csv);
    expect(result.imported).toBe(1);
    const [entry] = listForReport(db, {});
    expect(entry.endTs - entry.startTs).toBe(2 * H);
  });
});
