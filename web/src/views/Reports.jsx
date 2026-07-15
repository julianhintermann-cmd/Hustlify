import { useMemo, useState } from 'react';
import { useApp } from '../context.jsx';
import { queryString } from '../api.js';
import { todayInTz } from '../format.js';

// Reports are downloaded straight from the server as files, so we build plain
// anchor links carrying the current filters as query parameters.
export default function Reports() {
  const { categories, settings } = useApp();
  const tz = settings.timezone;
  const today = todayInTz(tz);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [categoryId, setCategoryId] = useState('');

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
        <div className="row">
          <div>
            <label>From</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>To</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
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
    </>
  );
}
