import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openDatabase } from '../db.js';
import { createEntry } from '../store/entries.js';
import { startTimer } from '../store/timer.js';
import { createNotifier } from '../notify.js';
import { DEFAULTS } from '../config.js';

const H = 60 * 60 * 1000;

function baseConfig(overrides = {}) {
  const config = structuredClone(DEFAULTS);
  config.app.timezone = 'UTC';
  config.notifications.ntfy_url = 'http://example.invalid/topic';
  return { ...config, ...overrides };
}

let db;
let send;

beforeEach(() => {
  db = openDatabase(':memory:');
  send = vi.fn().mockResolvedValue(undefined);
});

describe('timer reminder', () => {
  it('does nothing when no ntfy_url is configured', async () => {
    const config = baseConfig();
    config.notifications.ntfy_url = '';
    startTimer(db, {});
    const notifier = createNotifier({ db, config, send });
    await notifier.check(Date.now() + 20 * H);
    expect(send).not.toHaveBeenCalled();
  });

  it('fires once when a running timer passes the warning threshold', async () => {
    const config = baseConfig({});
    config.work.long_timer_warning_hours = 10;
    const start = startTimer(db, { note: 'long one' });
    const notifier = createNotifier({ db, config, send });

    // Not yet past the threshold.
    await notifier.check(start.startTs + 5 * H);
    expect(send).not.toHaveBeenCalled();

    // Past the threshold — fires once.
    await notifier.check(start.startTs + 11 * H);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(config.notifications.ntfy_url);
    expect(send.mock.calls[0][1].title).toMatch(/timer still running/i);

    // A later check for the SAME entry does not repeat the reminder.
    await notifier.check(start.startTs + 12 * H);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reminds again for a new timer after the previous one stopped', async () => {
    const config = baseConfig();
    config.work.long_timer_warning_hours = 1;
    const notifier = createNotifier({ db, config, send });

    const first = startTimer(db, {});
    await notifier.check(first.startTs + 2 * H);
    expect(send).toHaveBeenCalledTimes(1);

    // Stop and start a fresh timer.
    db.run(`UPDATE time_entries SET end_ts = ? WHERE id = ?`, first.startTs + 2 * H, first.id);
    const second = startTimer(db, {});
    await notifier.check(second.startTs + 2 * H);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('is disabled when timer_reminder is false', async () => {
    const config = baseConfig();
    config.notifications.timer_reminder = false;
    config.work.long_timer_warning_hours = 1;
    const start = startTimer(db, {});
    const notifier = createNotifier({ db, config, send });
    await notifier.check(start.startTs + 5 * H);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('daily summary', () => {
  it('fires once per day at or after the configured time', async () => {
    const config = baseConfig();
    config.notifications.daily_summary_at = '18:00';
    const notifier = createNotifier({ db, config, send });

    const morning = Date.UTC(2026, 6, 15, 9, 0); // 09:00 UTC
    await notifier.check(morning);
    expect(send).not.toHaveBeenCalled();

    const evening = Date.UTC(2026, 6, 15, 18, 5); // 18:05 UTC, same day
    await notifier.check(evening);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].title).toMatch(/daily summary/i);

    // Later the same evening — no repeat.
    await notifier.check(Date.UTC(2026, 6, 15, 19, 0));
    expect(send).toHaveBeenCalledTimes(1);

    // The next day, fires again.
    await notifier.check(Date.UTC(2026, 6, 16, 18, 0));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('is off by default (empty daily_summary_at)', async () => {
    const config = baseConfig();
    const notifier = createNotifier({ db, config, send });
    await notifier.check(Date.UTC(2026, 6, 15, 23, 0));
    expect(send).not.toHaveBeenCalled();
  });
});

describe('weekly summary', () => {
  it('fires only on first_day_of_week, once per week', async () => {
    const config = baseConfig();
    config.app.first_day_of_week = 'monday';
    config.notifications.weekly_summary_at = '08:00';
    const notifier = createNotifier({ db, config, send });

    // Wednesday 2026-07-15 — not the first day of the week.
    await notifier.check(Date.UTC(2026, 6, 15, 9, 0));
    expect(send).not.toHaveBeenCalled();

    // Monday 2026-07-13, before the configured time.
    await notifier.check(Date.UTC(2026, 6, 13, 7, 0));
    expect(send).not.toHaveBeenCalled();

    // Monday 2026-07-13, at the configured time.
    await notifier.check(Date.UTC(2026, 6, 13, 8, 30));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].title).toMatch(/weekly summary/i);

    // Later that same Monday — no repeat.
    await notifier.check(Date.UTC(2026, 6, 13, 20, 0));
    expect(send).toHaveBeenCalledTimes(1);

    // The following Monday — fires again.
    await notifier.check(Date.UTC(2026, 6, 20, 8, 30));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('includes an overtime line when overtime tracking is enabled', async () => {
    const config = baseConfig();
    config.app.first_day_of_week = 'monday';
    config.notifications.weekly_summary_at = '08:00';
    config.work.weekly_target_hours = 40;
    config.work.tracking_start = '2026-01-01';
    createEntry(db, {
      startTs: Date.UTC(2026, 6, 13, 6, 0),
      endTs: Date.UTC(2026, 6, 13, 7, 0),
      note: 'work',
    });
    const notifier = createNotifier({ db, config, send });
    await notifier.check(Date.UTC(2026, 6, 13, 8, 0));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].message).toMatch(/overtime/i);
  });
});
