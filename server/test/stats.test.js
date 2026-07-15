import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../db.js';
import { createEntry } from '../store/entries.js';
import { createCategory } from '../store/categories.js';
import { computeStats, heatmapData } from '../store/stats.js';
import { zonedDayStart } from '../time.js';

const H = 60 * 60 * 1000;

function baseConfig(overrides = {}) {
  return {
    app: { timezone: 'UTC', first_day_of_week: 'monday' },
    work: { weekly_target_hours: 40, tracking_start: '', hourly_rate: 0, currency: 'CHF' },
    ...overrides,
  };
}

let db;
beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('computeStats totals', () => {
  // Reference "now": Wed 2026-07-15 12:00 UTC.
  const now = Date.UTC(2026, 6, 15, 12, 0);

  it('sums today, this week and this month separately', () => {
    // 2h today
    createEntry(db, { startTs: Date.UTC(2026, 6, 15, 8, 0), endTs: Date.UTC(2026, 6, 15, 10, 0) });
    // 1h earlier this week (Monday 2026-07-13)
    createEntry(db, { startTs: Date.UTC(2026, 6, 13, 9, 0), endTs: Date.UTC(2026, 6, 13, 10, 0) });
    // 3h earlier this month but before this week (2026-07-05)
    createEntry(db, { startTs: Date.UTC(2026, 6, 5, 9, 0), endTs: Date.UTC(2026, 6, 5, 12, 0) });
    // 5h last month (should not count anywhere)
    createEntry(db, { startTs: Date.UTC(2026, 5, 20, 9, 0), endTs: Date.UTC(2026, 5, 20, 14, 0) });

    const stats = computeStats(db, baseConfig(), { range: 'week', now });
    expect(stats.todayMs).toBe(2 * H);
    expect(stats.weekMs).toBe(3 * H); // 2h today + 1h Monday
    expect(stats.monthMs).toBe(6 * H); // week + 3h on the 5th
  });

  it('excludes a running entry from totals', () => {
    createEntry(db, { startTs: Date.UTC(2026, 6, 15, 8, 0), endTs: Date.UTC(2026, 6, 15, 9, 0) });
    db.run(
      `INSERT INTO time_entries (category_id, start_ts, end_ts, note, created_at)
       VALUES (NULL, ?, NULL, '', ?)`,
      Date.UTC(2026, 6, 15, 11, 0),
      now,
    );
    const stats = computeStats(db, baseConfig(), { now });
    expect(stats.todayMs).toBe(1 * H);
  });

  it('builds a daily series covering the whole week with zero-filled gaps', () => {
    createEntry(db, { startTs: Date.UTC(2026, 6, 13, 9, 0), endTs: Date.UTC(2026, 6, 13, 11, 0) });
    const stats = computeStats(db, baseConfig(), { range: 'week', now });
    expect(stats.daily[0]).toEqual({ date: '2026-07-13', ms: 2 * H });
    expect(stats.daily.find((d) => d.date === '2026-07-14').ms).toBe(0);
    expect(stats.daily).toHaveLength(3); // Mon..Wed
  });

  it('groups a category breakdown sorted by time descending', () => {
    const dev = createCategory(db, { name: 'Dev', color: '#3b82f6' });
    // 1h uncategorized, 3h in "Dev" -> Dev should sort first.
    createEntry(db, { startTs: Date.UTC(2026, 6, 15, 8, 0), endTs: Date.UTC(2026, 6, 15, 9, 0) });
    createEntry(db, {
      categoryId: dev.id,
      startTs: Date.UTC(2026, 6, 15, 9, 0),
      endTs: Date.UTC(2026, 6, 15, 12, 0),
    });
    const stats = computeStats(db, baseConfig(), { now });
    expect(stats.breakdown[0].name).toBe('Dev');
    expect(stats.breakdown[0].ms).toBe(3 * H);
    expect(stats.breakdown[1].name).toBe('Uncategorized');
    expect(stats.breakdown[1].ms).toBe(1 * H);
  });
});

describe('overtime', () => {
  it('is null when disabled', () => {
    const now = Date.UTC(2026, 6, 15, 12, 0);
    const stats = computeStats(db, baseConfig(), { now });
    expect(stats.overtime).toBeNull();
  });

  it('computes a positive balance when tracked time exceeds the accrued target', () => {
    // Start exactly one week before now; target 40h/week.
    const start = '2026-07-08';
    const startMs = zonedDayStart(start, 'UTC');
    const now = startMs + 7 * 24 * H; // exactly one week later
    // Track 45h in that week -> +5h overtime.
    createEntry(db, { startTs: startMs + H, endTs: startMs + H + 45 * H });

    const cfg = baseConfig({
      work: { weekly_target_hours: 40, tracking_start: start, hourly_rate: 0, currency: 'CHF' },
    });
    const stats = computeStats(db, cfg, { now });
    expect(stats.overtime.trackedMs).toBe(45 * H);
    expect(stats.overtime.targetMs).toBe(40 * H);
    expect(stats.overtime.balanceMs).toBe(5 * H);
  });
});

describe('heatmapData', () => {
  const now = Date.UTC(2026, 6, 15, 12, 0); // Wed 2026-07-15 noon UTC

  it('covers 371 days ending today, zero-filled', () => {
    const { days } = heatmapData(db, baseConfig(), now);
    expect(days).toHaveLength(371);
    expect(days[days.length - 1].date).toBe('2026-07-15');
    expect(days.every((d) => d.ms === 0)).toBe(true);
  });

  it('computes a streak of consecutive tracked days ending today', () => {
    // Tracked today, yesterday and the day before — a 3-day streak.
    createEntry(db, { startTs: Date.UTC(2026, 6, 13, 9, 0), endTs: Date.UTC(2026, 6, 13, 10, 0) });
    createEntry(db, { startTs: Date.UTC(2026, 6, 14, 9, 0), endTs: Date.UTC(2026, 6, 14, 10, 0) });
    createEntry(db, { startTs: Date.UTC(2026, 6, 15, 9, 0), endTs: Date.UTC(2026, 6, 15, 10, 0) });
    const { streak } = heatmapData(db, baseConfig(), now);
    expect(streak).toBe(3);
  });

  it('does not break the streak just because today has no entry yet', () => {
    createEntry(db, { startTs: Date.UTC(2026, 6, 13, 9, 0), endTs: Date.UTC(2026, 6, 13, 10, 0) });
    createEntry(db, { startTs: Date.UTC(2026, 6, 14, 9, 0), endTs: Date.UTC(2026, 6, 14, 10, 0) });
    // Nothing tracked yet today (2026-07-15) — streak should still count
    // yesterday and the day before as an active 2-day streak.
    const { streak } = heatmapData(db, baseConfig(), now);
    expect(streak).toBe(2);
  });

  it('resets to 0 once a day is missed', () => {
    createEntry(db, { startTs: Date.UTC(2026, 6, 10, 9, 0), endTs: Date.UTC(2026, 6, 10, 10, 0) });
    // Gap on the 11th-14th, nothing today either.
    const { streak } = heatmapData(db, baseConfig(), now);
    expect(streak).toBe(0);
  });
});
