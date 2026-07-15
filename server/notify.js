import { getRunning } from './store/timer.js';
import { computeStats } from './store/stats.js';
import { localDateString, weekdayOf, rangeDates } from './time.js';

// POST a plain-text ntfy message. Fire-and-forget: logs failures but never
// throws — a notification hiccup must never affect the app's normal operation.
export async function postNtfy(url, { title, message, tags } = {}) {
  try {
    const headers = { 'Content-Type': 'text/plain; charset=utf-8' };
    if (title) headers.Title = title;
    if (tags) headers.Tags = tags;
    const res = await fetch(url, { method: 'POST', headers, body: message });
    if (!res.ok) console.warn(`[notify] ntfy responded with status ${res.status}`);
  } catch (err) {
    console.warn(`[notify] Could not reach ntfy: ${err.message}`);
  }
}

function firstDayWeekdayIndex(firstDayOfWeek) {
  return firstDayOfWeek === 'sunday' ? 0 : 1;
}

function clockString(ts, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

function formatHM(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// Creates a notifier that, on each check(now), sends any ntfy push that is
// currently due — the timer-still-running reminder, the daily summary, and
// the weekly summary — each exactly once per occurrence. All dedup state is
// kept in closure, so a single instance should live for the process lifetime.
export function createNotifier({ db, config, send = postNtfy }) {
  let lastReminderEntryId = null;
  let lastDailyDate = null;
  let lastWeeklyKey = null;

  async function checkTimerReminder(now) {
    const n = config.notifications;
    if (!n.timer_reminder || config.work.long_timer_warning_hours <= 0) return;

    const running = getRunning(db);
    if (!running) {
      lastReminderEntryId = null;
      return;
    }
    const thresholdMs = config.work.long_timer_warning_hours * 3600000;
    if (now - running.startTs > thresholdMs && lastReminderEntryId !== running.id) {
      await send(n.ntfy_url, {
        title: `${config.app.title}: timer still running`,
        message: `Your timer${running.categoryName ? ` (${running.categoryName})` : ''} has been running for over ${config.work.long_timer_warning_hours}h. Still working?`,
        tags: 'stopwatch',
      });
      lastReminderEntryId = running.id;
    }
  }

  async function checkDailySummary(now) {
    const n = config.notifications;
    if (!n.daily_summary_at) return;
    const tz = config.app.timezone;
    const today = localDateString(now, tz);
    if (clockString(now, tz) < n.daily_summary_at || lastDailyDate === today) return;

    const stats = computeStats(db, config, { range: 'week', now });
    await send(n.ntfy_url, {
      title: `${config.app.title}: daily summary`,
      message: `Today: ${formatHM(stats.todayMs)} tracked.`,
      tags: 'bar_chart',
    });
    lastDailyDate = today;
  }

  async function checkWeeklySummary(now) {
    const n = config.notifications;
    if (!n.weekly_summary_at) return;
    const tz = config.app.timezone;
    const today = localDateString(now, tz);
    const isFirstDay = weekdayOf(today) === firstDayWeekdayIndex(config.app.first_day_of_week);
    if (!isFirstDay || clockString(now, tz) < n.weekly_summary_at) return;

    const week = rangeDates('week', now, tz, config.app.first_day_of_week);
    if (lastWeeklyKey === week.fromDate) return;

    const stats = computeStats(db, config, { range: 'week', now });
    const overtimeLine = stats.overtime
      ? ` Overtime: ${stats.overtime.balanceMs >= 0 ? '+' : '-'}${formatHM(Math.abs(stats.overtime.balanceMs))}.`
      : '';
    await send(n.ntfy_url, {
      title: `${config.app.title}: weekly summary`,
      message: `This week: ${formatHM(stats.weekMs)} tracked.${overtimeLine}`,
      tags: 'calendar',
    });
    lastWeeklyKey = week.fromDate;
  }

  async function check(now = Date.now()) {
    if (!config.notifications.ntfy_url) return;
    await checkTimerReminder(now);
    await checkDailySummary(now);
    await checkWeeklySummary(now);
  }

  return { check };
}
