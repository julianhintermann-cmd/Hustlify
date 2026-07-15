import {
  localDateString,
  zonedDayStart,
  addDays,
  rangeDates,
  dayRangeToMillis,
  eachDay,
} from '../time.js';

// Sum the tracked milliseconds of completed entries within [startMs, endMs),
// grouped as requested. Running entries are excluded from totals so numbers
// never jump around while a timer ticks.
function sumBetween(db, startMs, endMs) {
  const row = db.get(
    `SELECT COALESCE(SUM(end_ts - start_ts), 0) AS ms
       FROM time_entries
      WHERE end_ts IS NOT NULL AND start_ts >= ? AND start_ts < ?`,
    startMs,
    endMs,
  );
  return row.ms;
}

function categoryBreakdown(db, startMs, endMs) {
  return db.all(
    `SELECT c.id AS categoryId,
            COALESCE(c.name, 'Uncategorized') AS name,
            COALESCE(c.color, '#9ca3af') AS color,
            SUM(e.end_ts - e.start_ts) AS ms
       FROM time_entries e
       LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.end_ts IS NOT NULL AND e.start_ts >= ? AND e.start_ts < ?
      GROUP BY c.id
      ORDER BY ms DESC`,
    startMs,
    endMs,
  );
}

// Tracked ms per calendar day across an inclusive day range, filling gaps with 0.
function dailySeries(db, fromDate, toDate, tz) {
  const days = eachDay(fromDate, toDate);
  const totals = new Map(days.map((d) => [d, 0]));
  const { startMs, endMs } = dayRangeToMillis(fromDate, toDate, tz);
  const rows = db.all(
    `SELECT start_ts AS startTs, end_ts AS endTs
       FROM time_entries
      WHERE end_ts IS NOT NULL AND start_ts >= ? AND start_ts < ?`,
    startMs,
    endMs,
  );
  for (const r of rows) {
    const day = localDateString(r.startTs, tz);
    if (totals.has(day)) totals.set(day, totals.get(day) + (r.endTs - r.startTs));
  }
  return days.map((date) => ({ date, ms: totals.get(date) }));
}

// Overtime = tracked time since the configured tracking_start minus the accrued
// weekly target for the number of whole weeks elapsed. Disabled when the target
// is 0 or no tracking_start is set.
function overtime(db, config, now) {
  const tz = config.app.timezone;
  const target = config.work.weekly_target_hours;
  const startDate = config.work.tracking_start;
  if (!target || !startDate) return null;

  const startMs = zonedDayStart(startDate, tz);
  const nowMs = now;
  if (nowMs <= startMs) return { balanceMs: 0, targetMs: 0, trackedMs: 0 };

  const trackedMs = sumBetween(db, startMs, nowMs);
  const elapsedWeeks = (nowMs - startMs) / (7 * 24 * 60 * 60 * 1000);
  const targetMs = elapsedWeeks * target * 60 * 60 * 1000;
  return {
    balanceMs: Math.round(trackedMs - targetMs),
    targetMs: Math.round(targetMs),
    trackedMs,
  };
}

// The full stats payload for the dashboard.
export function computeStats(db, config, { range = 'week', now = Date.now() } = {}) {
  const tz = config.app.timezone;
  const firstDay = config.app.first_day_of_week;

  const today = localDateString(now, tz);
  const todayStart = zonedDayStart(today, tz);
  const todayEnd = zonedDayStart(addDays(today, 1), tz);

  const week = rangeDates('week', now, tz, firstDay);
  const weekMs = dayRangeToMillis(week.fromDate, week.toDate, tz);
  const month = rangeDates('month', now, tz, firstDay);
  const monthMs = dayRangeToMillis(month.fromDate, month.toDate, tz);

  const selected = range === 'month' ? month : week;
  const selectedMs = range === 'month' ? monthMs : weekMs;

  return {
    range,
    todayMs: sumBetween(db, todayStart, todayEnd),
    weekMs: sumBetween(db, weekMs.startMs, weekMs.endMs),
    monthMs: sumBetween(db, monthMs.startMs, monthMs.endMs),
    breakdown: categoryBreakdown(db, selectedMs.startMs, selectedMs.endMs),
    daily: dailySeries(db, selected.fromDate, selected.toDate, tz),
    overtime: overtime(db, config, now),
    hourlyRate: config.work.hourly_rate,
    currency: config.work.currency,
  };
}
