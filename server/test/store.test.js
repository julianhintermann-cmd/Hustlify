import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../db.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../store/categories.js';
import {
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  getEntry,
} from '../store/entries.js';
import { startTimer, stopTimer, getRunning } from '../store/timer.js';

let db;
beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('categories', () => {
  it('creates, lists, updates and archives categories', () => {
    const c = createCategory(db, { name: 'Client Work', color: '#fb923c' });
    expect(c.id).toBeGreaterThan(0);
    expect(c.color).toBe('#fb923c');
    expect(listCategories(db)).toHaveLength(1);

    updateCategory(db, c.id, { name: 'Client', archived: true });
    expect(listCategories(db)).toHaveLength(0); // archived hidden by default
    expect(listCategories(db, { includeArchived: true })[0].name).toBe('Client');
  });

  it('rejects empty names and bad colors', () => {
    expect(() => createCategory(db, { name: '   ' })).toThrow(/name is required/i);
    expect(() => createCategory(db, { name: 'X', color: 'red' })).toThrow(/hex/i);
  });

  it('keeps entries but nulls their category when a category is deleted', () => {
    const c = createCategory(db, { name: 'Temp' });
    const e = createEntry(db, {
      categoryId: c.id,
      startTs: 1000,
      endTs: 5000,
      note: 'keep me',
    });
    deleteCategory(db, c.id);
    const after = getEntry(db, e.id);
    expect(after.categoryId).toBeNull();
    expect(after.note).toBe('keep me');
  });
});

describe('entries', () => {
  it('creates a completed entry and computes duration', () => {
    const e = createEntry(db, { startTs: 1000, endTs: 4600, note: 'hi' });
    expect(e.durationMs).toBe(3600);
    expect(e.running).toBe(false);
  });

  it('rejects an end that is not after the start', () => {
    expect(() => createEntry(db, { startTs: 5000, endTs: 5000 })).toThrow(/after/i);
  });

  it('filters by note search and category', () => {
    const c = createCategory(db, { name: 'Dev' });
    createEntry(db, { startTs: 1000, endTs: 2000, note: 'writing docs' });
    createEntry(db, { categoryId: c.id, startTs: 3000, endTs: 4000, note: 'fixing bug' });

    expect(listEntries(db, { q: 'bug' })).toHaveLength(1);
    expect(listEntries(db, { categoryId: c.id })).toHaveLength(1);
    expect(listEntries(db, { startMs: 2500, endMs: 5000 })).toHaveLength(1);
  });

  it('updates and deletes an entry', () => {
    const e = createEntry(db, { startTs: 1000, endTs: 2000, note: 'a' });
    const updated = updateEntry(db, e.id, { note: 'b', endTs: 3000 });
    expect(updated.note).toBe('b');
    expect(updated.durationMs).toBe(2000);
    deleteEntry(db, e.id);
    expect(listEntries(db)).toHaveLength(0);
  });
});

describe('timer', () => {
  it('starts and stops, producing one completed entry', () => {
    expect(getRunning(db)).toBeNull();
    const running = startTimer(db, { note: 'focus' });
    expect(running.running).toBe(true);
    expect(getRunning(db).id).toBe(running.id);

    const stopped = stopTimer(db);
    expect(stopped.running).toBe(false);
    expect(stopped.durationMs).toBeGreaterThan(0);
    expect(getRunning(db)).toBeNull();
  });

  it('refuses a second concurrent timer', () => {
    startTimer(db, {});
    expect(() => startTimer(db, {})).toThrow(/already running/i);
  });

  it('refuses to stop when nothing runs', () => {
    expect(() => stopTimer(db)).toThrow(/no timer/i);
  });
});
