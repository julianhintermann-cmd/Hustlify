import { describe, it, expect } from 'vitest';
import {
  localDateString,
  zonedDayStart,
  weekdayOf,
  addDays,
  rangeDates,
  eachDay,
} from '../time.js';

describe('localDateString', () => {
  it('formats an instant as the local calendar date', () => {
    // 2026-01-15 23:30 UTC is already 2026-01-16 00:30 in Zurich (UTC+1)
    const ts = Date.UTC(2026, 0, 15, 23, 30);
    expect(localDateString(ts, 'Europe/Zurich')).toBe('2026-01-16');
    expect(localDateString(ts, 'UTC')).toBe('2026-01-15');
  });
});

describe('zonedDayStart', () => {
  it('returns UTC midnight for a UTC date', () => {
    expect(zonedDayStart('2026-03-10', 'UTC')).toBe(Date.UTC(2026, 2, 10, 0, 0, 0));
  });

  it('accounts for a positive timezone offset', () => {
    // Zurich winter is UTC+1, so local midnight is 23:00 the previous UTC day.
    expect(zonedDayStart('2026-01-10', 'Europe/Zurich')).toBe(Date.UTC(2026, 0, 9, 23, 0, 0));
  });

  it('handles a DST spring-forward day', () => {
    // Switzerland switches to summer time on 2026-03-29. Midnight local is still
    // a valid instant (offset +1 before the 02:00 jump).
    const start = zonedDayStart('2026-03-29', 'Europe/Zurich');
    expect(localDateString(start, 'Europe/Zurich')).toBe('2026-03-29');
    // Round-trips: the instant maps back to the same local date.
    expect(localDateString(start - 1, 'Europe/Zurich')).toBe('2026-03-28');
  });
});

describe('weekdayOf', () => {
  it('returns 0 for Sunday and 4 for Thursday', () => {
    expect(weekdayOf('2026-07-12')).toBe(0); // Sunday
    expect(weekdayOf('2026-07-16')).toBe(4); // Thursday
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('rangeDates', () => {
  const now = Date.UTC(2026, 6, 15, 12, 0); // Wed 2026-07-15 noon UTC

  it('computes the current week starting Monday', () => {
    const { fromDate, toDate } = rangeDates('week', now, 'UTC', 'monday');
    expect(fromDate).toBe('2026-07-13'); // Monday
    expect(toDate).toBe('2026-07-15'); // Wednesday (today)
  });

  it('computes the current week starting Sunday', () => {
    const { fromDate, toDate } = rangeDates('week', now, 'UTC', 'sunday');
    expect(fromDate).toBe('2026-07-12'); // Sunday
    expect(toDate).toBe('2026-07-15');
  });

  it('computes the current month', () => {
    const { fromDate, toDate } = rangeDates('month', now, 'UTC');
    expect(fromDate).toBe('2026-07-01');
    expect(toDate).toBe('2026-07-15');
  });
});

describe('eachDay', () => {
  it('lists every day inclusive', () => {
    expect(eachDay('2026-07-13', '2026-07-15')).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
    ]);
  });
});
