import { useMemo, useRef, useState } from 'react';
import { useApp } from '../context.jsx';
import { api, queryString } from '../api.js';
import { todayInTz, presetRange } from '../format.js';

const PRESETS = [
  { id: 'thisWeek', label: 'This week' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
];

// Reports are downloaded straight from the server as files, so we build plain
// anchor links carrying the current filters as query parameters.
export default function Reports() {
  const { categories, settings, showToast } = useApp();
  const tz = settings.timezone;
  const today = todayInTz(tz);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [categoryId, setCategoryId] = useState('');
  const [preset, setPreset] = useState('thisMonth');
  const [restoring, setRestoring] = useState(false);
  const fileInput = useRef(null);

  async function handleRestoreFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    if (
      !confirm(
        `Restore from "${file.name}"? This replaces ALL current data (entries and categories) with the contents of this backup. This cannot be undone.`,
      )
    ) {
      return;
    }
    setRestoring(true);
    try {
      await api.restoreBackup(file);
      showToast('Database restored. Reloading…');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      showToast(err.message, 'error');
      setRestoring(false);
    }
  }

  function applyPreset(id) {
    const range = presetRange(id, tz, settings.firstDayOfWeek);
    setFrom(range.from);
    setTo(range.to);
    setPreset(id);
  }

  const params = useMemo(
    () => ({ from, to, category_id: categoryId }),
    [from, to, categoryId],
  );
  const qs = queryString(params);

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <p>Pick a period and category, then download a work report as PDF or the raw data as CSV.</p>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="nav-pill-group wrap-mobile" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`nav-pill${preset === p.id ? ' active' : ''}`}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="row">
          <div>
            <label>From</label>
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset(null);
              }}
            />
          </div>
          <div>
            <label>To</label>
            <input
              type="date"
              className="input"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset(null);
              }}
            />
          </div>
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <label>Category</label>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="divider" />

        <div className="row">
          <a className="btn btn-primary" href={`/api/report.pdf${qs}`} target="_blank" rel="noreferrer">
            Download PDF report
          </a>
          <a className="btn btn-secondary" href={`/api/export.csv${qs}`}>
            Download CSV
          </a>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
          The PDF groups entries by day with per-category totals
          {settings.hourlyRate > 0 ? ' and estimated earnings' : ''}. Only completed entries are included.
        </p>
      </div>

      <div className="card-outline" style={{ maxWidth: 640, marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Backup</h3>
        <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
          Download a complete, consistent copy of the database — every entry and category, independent of any date filter above.
        </p>
        <div className="row">
          <a className="btn btn-secondary" href="/api/backup.db">
            Download database backup
          </a>
          <button
            className="btn btn-secondary"
            onClick={() => fileInput.current?.click()}
            disabled={restoring}
          >
            {restoring ? 'Restoring…' : 'Restore from backup'}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".db"
          onChange={handleRestoreFile}
          style={{ display: 'none' }}
        />
        <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
          Restoring replaces all current entries and categories with the contents of the uploaded
          file. The file is checked to make sure it's really a Hustlify backup before anything is
          changed.
        </p>
      </div>
    </>
  );
}
