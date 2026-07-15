// Timezone-aware date helpers. Timestamps everywhere in Hustlify are stored as
// epoch milliseconds (UTC); these helpers translate them into the calendar days,
// weeks and months of the configured timezone so that "today" and "this week"
// mean what the user expects regardless of where the server runs.

// Wall-clock offset (localTime - UTC) in milliseconds for an instant in a tz.
function offsetMs(ts, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map = {};
  for (const p of dtf.formatToParts(new Date(ts))) map[p.type] = p.value;
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - ts;
}

// The local calendar date ('YYYY-MM-DD') of an instant in the given timezone.
export function localDateString(ts, tz) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(new Date(ts)); // en-CA formats as YYYY-MM-DD
}

// Epoch ms of local midnight (00:00:00) for a 'YYYY-MM-DD' date in the timezone.
export function zonedDayStart(dateStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let ts = utcGuess - offsetMs(utcGuess, tz);
  // Refine once to handle DST transitions where the first guess lands in the
  // wrong offset window.
  const refined = utcGuess - offsetMs(ts, tz);
  if (refined !== ts) ts = refined;
  return ts;
}

// Weekday index (0 = Sunday … 6 = Saturday) for a 'YYYY-MM-DD' calendar date.
export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Add `days` to a 'YYYY-MM-DD' date, returning a new 'YYYY-MM-DD'.
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// The date range [from, to] of days for a named range relative to `now`.
// Returns { fromDate, toDate } as 'YYYY-MM-DD' strings (inclusive).
export function rangeDates(range, now, tz, firstDayOfWeek = 'monday') {
  const today = localDateString(now, tz);
  if (range === 'month') {
    const [y, m] = today.split('-');
    return { fromDate: `${y}-${m}-01`, toDate: today };
  }
  // Default: current week.
  const firstIdx = firstDayOfWeek === 'sunday' ? 0 : 1;
  const dow = weekdayOf(today);
  const back = (dow - firstIdx + 7) % 7;
  return { fromDate: addDays(today, -back), toDate: today };
}

// Convert an inclusive day range into an [startMs, endMs) millisecond window.
export function dayRangeToMillis(fromDate, toDate, tz) {
  return {
    startMs: zonedDayStart(fromDate, tz),
    endMs: zonedDayStart(addDays(toDate, 1), tz),
  };
}

// Local wall-clock time 'HH:MM' of an instant in the timezone.
export function formatClock(ts, tz) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return dtf.format(new Date(ts));
}

// A millisecond duration rendered as 'H:MM' (e.g. 3600000 -> '1:00').
export function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

// A millisecond duration as decimal hours rounded to 2 places (e.g. 1.5).
export function decimalHours(ms) {
  return Math.round((ms / 3600000) * 100) / 100;
}

// List every date string from fromDate to toDate inclusive.
export function eachDay(fromDate, toDate) {
  const out = [];
  let cur = fromDate;
  while (cur <= toDate) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
