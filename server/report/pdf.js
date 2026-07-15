import PDFDocument from 'pdfkit';
import { localDateString, formatClock, formatDuration, decimalHours } from '../time.js';

// Palette echoing the app's Cal.com-style look, kept PDF-safe.
const INK = '#111111';
const BODY = '#374151';
const MUTED = '#6b7280';
const HAIRLINE = '#e5e7eb';

const PAGE = { margin: 48 };
const COLS = { time: 48, duration: 168, category: 232, note: 352 };
const RIGHT = 547; // content right edge (A4 595 - margin 48)

function weekdayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Stream a PDF work report for the given completed entries into `stream`.
export function generateReport(stream, { entries, config, fromDate, toDate, now = Date.now() }) {
  const tz = config.app.timezone;
  const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin });
  doc.pipe(stream);

  // ---- Header --------------------------------------------------------------
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(22).text('Work Report', PAGE.margin, PAGE.margin);
  const rightMeta = [`Period: ${fromDate} — ${toDate}`, `Generated: ${localDateString(now, tz)}`];
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  doc.text(rightMeta.join('\n'), RIGHT - 200, PAGE.margin + 4, { width: 200, align: 'right' });

  let y = PAGE.margin + 34;
  const who = [config.report.person_name, config.report.company_name].filter(Boolean).join('  ·  ');
  if (who) {
    doc.font('Helvetica').fontSize(11).fillColor(BODY).text(who, PAGE.margin, y);
    y += 20;
  }
  doc.moveTo(PAGE.margin, y).lineTo(RIGHT, y).strokeColor(HAIRLINE).lineWidth(1).stroke();
  y += 16;

  // ---- Group entries by day ------------------------------------------------
  const byDay = new Map();
  let totalMs = 0;
  const perCategory = new Map();
  for (const e of entries) {
    const day = localDateString(e.startTs, tz);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
    totalMs += e.durationMs;
    const key = e.categoryName || 'Uncategorized';
    const cur = perCategory.get(key) || { ms: 0, color: e.categoryColor || '#9ca3af' };
    cur.ms += e.durationMs;
    perCategory.set(key, cur);
  }

  const ensureSpace = (needed) => {
    if (y + needed > 800) {
      doc.addPage();
      y = PAGE.margin;
    }
  };

  const drawRowHeader = () => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
    doc.text('TIME', COLS.time, y);
    doc.text('DURATION', COLS.duration, y);
    doc.text('CATEGORY', COLS.category, y);
    doc.text('NOTE', COLS.note, y);
    y += 14;
  };

  if (entries.length === 0) {
    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('No entries in this period.', PAGE.margin, y);
  }

  for (const [day, dayEntries] of byDay) {
    ensureSpace(60);
    const dayMs = dayEntries.reduce((s, e) => s + e.durationMs, 0);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(weekdayLabel(day), PAGE.margin, y);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`${formatDuration(dayMs)} h`, RIGHT - 100, y, {
      width: 100,
      align: 'right',
    });
    y += 18;
    drawRowHeader();

    for (const e of dayEntries) {
      ensureSpace(18);
      doc.font('Helvetica').fontSize(9).fillColor(BODY);
      doc.text(`${formatClock(e.startTs, tz)}–${formatClock(e.endTs, tz)}`, COLS.time, y, { width: 110 });
      doc.text(`${formatDuration(e.durationMs)} h`, COLS.duration, y, { width: 60 });
      doc.text(e.categoryName || 'Uncategorized', COLS.category, y, { width: 116 });
      doc.text(e.note || '—', COLS.note, y, { width: RIGHT - COLS.note });
      const noteHeight = doc.heightOfString(e.note || '—', { width: RIGHT - COLS.note });
      y += Math.max(14, noteHeight + 4);
    }
    y += 8;
    doc.moveTo(PAGE.margin, y).lineTo(RIGHT, y).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
    y += 12;
  }

  // ---- Summary -------------------------------------------------------------
  ensureSpace(120);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text('Summary', PAGE.margin, y);
  y += 22;

  doc.font('Helvetica').fontSize(11).fillColor(BODY);
  doc.text('Total tracked', COLS.time, y);
  doc.font('Helvetica-Bold').text(`${formatDuration(totalMs)} h  (${decimalHours(totalMs)} h)`, RIGHT - 220, y, {
    width: 220,
    align: 'right',
  });
  y += 20;

  if (config.work.hourly_rate > 0) {
    const earnings = decimalHours(totalMs) * config.work.hourly_rate;
    doc.font('Helvetica').fillColor(BODY).text('Estimated earnings', COLS.time, y);
    doc.font('Helvetica-Bold').text(
      `${earnings.toFixed(2)} ${config.work.currency}`,
      RIGHT - 220,
      y,
      { width: 220, align: 'right' },
    );
    y += 20;
  }

  if (perCategory.size > 0) {
    y += 6;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('BY CATEGORY', COLS.time, y);
    y += 14;
    for (const [name, info] of [...perCategory.entries()].sort((a, b) => b[1].ms - a[1].ms)) {
      ensureSpace(16);
      doc.circle(COLS.time + 4, y + 5, 4).fill(info.color);
      doc.font('Helvetica').fontSize(10).fillColor(BODY).text(name, COLS.time + 14, y);
      doc.text(`${formatDuration(info.ms)} h`, RIGHT - 120, y, { width: 120, align: 'right' });
      y += 16;
    }
  }

  // ---- Footer note ---------------------------------------------------------
  if (config.report.footer_note) {
    ensureSpace(40);
    y += 12;
    doc.moveTo(PAGE.margin, y).lineTo(RIGHT, y).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
    y += 10;
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(config.report.footer_note, PAGE.margin, y, {
      width: RIGHT - PAGE.margin,
    });
  }

  doc.end();
}
