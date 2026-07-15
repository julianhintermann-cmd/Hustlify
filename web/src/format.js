// Client-side formatting helpers. Timestamps are epoch milliseconds.

export function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// Live H:MM:SS used by the running timer.
export function formatStopwatch(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function decimalHours(ms) {
  return Math.round((ms / 3600000) * 100) / 100;
}

export function formatClock(ts, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

export function formatDate(ts, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
}

// Convert a local <input type="datetime-local"> value to epoch ms, interpreting
// the wall-clock in the configured timezone.
export function localInputToTs(value, tz) {
  // value like "2026-07-15T09:30"
  if (!value) return null;
  const [datePart, timePart] = value.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  // Determine the tz offset at that instant and correct.
  const offset = tzOffsetMs(utcGuess, tz);
  let ts = utcGuess - offset;
  const refined = utcGuess - tzOffsetMs(ts, tz);
  if (refined !== ts) ts = refined;
  return ts;
}

// Format an epoch ms as a value for <input type="datetime-local"> in the tz.
export function tsToLocalInput(ts, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ts));
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  const hour = m.hour === '24' ? '00' : m.hour;
  return `${m.year}-${m.month}-${m.day}T${hour}:${m.minute}`;
}

// Today's date as YYYY-MM-DD in the timezone.
export function todayInTz(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function tzOffsetMs(ts, tz) {
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
  const m = {};
  for (const p of dtf.formatToParts(new Date(ts))) m[p.type] = p.value;
  const hour = m.hour === '24' ? 0 : Number(m.hour);
  const asUTC = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    hour,
    Number(m.minute),
    Number(m.second),
  );
  return asUTC - ts;
}
