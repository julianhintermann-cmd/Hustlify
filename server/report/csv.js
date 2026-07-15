import { localDateString, formatClock, formatDuration, decimalHours } from '../time.js';

function escapeCsv(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Render completed entries as CSV. Times are rendered in the configured timezone.
export function entriesToCsv(entries, tz) {
  const header = ['Date', 'Start', 'End', 'Duration', 'Hours', 'Category', 'Note'];
  const lines = [header.join(',')];
  for (const e of entries) {
    lines.push(
      [
        localDateString(e.startTs, tz),
        formatClock(e.startTs, tz),
        formatClock(e.endTs, tz),
        formatDuration(e.durationMs),
        decimalHours(e.durationMs),
        e.categoryName || 'Uncategorized',
        e.note || '',
      ]
        .map(escapeCsv)
        .join(','),
    );
  }
  return lines.join('\r\n');
}
