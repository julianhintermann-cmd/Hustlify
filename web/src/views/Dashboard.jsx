import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../context.jsx';
import { StatTile, Empty } from '../components/ui.jsx';
import { formatDuration, decimalHours } from '../format.js';

export default function Dashboard() {
  const { settings, showToast } = useApp();
  const [range, setRange] = useState('week');
  const [stats, setStats] = useState(null);
  const [heatmap, setHeatmap] = useState(null);

  const load = useCallback(
    async (r) => {
      try {
        setStats(await api.getStats(r));
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
    [showToast],
  );

  useEffect(() => {
    load(range);
  }, [range, load]);

  // The activity heatmap always covers the last year, independent of the
  // week/month toggle above, so it's fetched once rather than on every range change.
  useEffect(() => {
    api.getHeatmap().then(setHeatmap).catch((err) => showToast(err.message, 'error'));
  }, [showToast]);

  if (!stats) return <Empty>Loading…</Empty>;

  const selectedMs = range === 'month' ? stats.monthMs : stats.weekMs;
  const showEarnings = settings.hourlyRate > 0;
  const earnings = showEarnings ? (decimalHours(selectedMs) * settings.hourlyRate).toFixed(2) : null;

  return (
    <>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>Dashboard</h1>
          <p>Your tracked time at a glance.</p>
        </div>
        <div className="nav-pill-group">
          <button className={`nav-pill${range === 'week' ? ' active' : ''}`} onClick={() => setRange('week')}>
            This week
          </button>
          <button className={`nav-pill${range === 'month' ? ' active' : ''}`} onClick={() => setRange('month')}>
            This month
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <StatTile label="Today" value={formatDuration(stats.todayMs)} unit="h" />
        <StatTile label="This week" value={formatDuration(stats.weekMs)} unit="h" />
        <StatTile label="This month" value={formatDuration(stats.monthMs)} unit="h" />
      </div>

      {(stats.overtime || showEarnings) && (
        <div className="grid grid-2" style={{ marginBottom: 24 }}>
          {stats.overtime ? (
            <StatTile
              label="Overtime balance"
              value={`${stats.overtime.balanceMs >= 0 ? '+' : '−'}${formatDuration(Math.abs(stats.overtime.balanceMs))}`}
              unit="h"
              tone={stats.overtime.balanceMs >= 0 ? 'pos' : 'neg'}
              sub={`Target ${formatDuration(stats.overtime.targetMs)} h · tracked ${formatDuration(stats.overtime.trackedMs)} h`}
            />
          ) : null}
          {showEarnings ? (
            <StatTile
              label={`Estimated earnings (${range === 'month' ? 'this month' : 'this week'})`}
              value={earnings}
              unit={settings.currency}
              sub={`${settings.hourlyRate} ${settings.currency}/h`}
            />
          ) : null}
        </div>
      )}

      {/* Daily bar chart (single series — one hue) */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 className="section-title">Time per day ({range === 'month' ? 'this month' : 'this week'})</h3>
        <DailyBars daily={stats.daily} />
      </div>

      {/* Category breakdown (color = entity, always paired with a label) */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 className="section-title">By category</h3>
        <CategoryBreakdown breakdown={stats.breakdown} />
      </div>

      {/* Year heatmap (sequential, single-hue intensity) + current streak */}
      {heatmap ? (
        <div className="card-outline">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h3>Activity</h3>
            {heatmap.streak > 0 ? (
              <span className="streak-badge">🔥 {heatmap.streak}-day streak</span>
            ) : null}
          </div>
          <YearHeatmap days={heatmap.days} tz={settings.timezone} />
          <div className="heatmap-legend">
            <span>Less</span>
            <span className="heatmap-cell" />
            <span className="heatmap-cell level-1" />
            <span className="heatmap-cell level-2" />
            <span className="heatmap-cell level-3" />
            <span className="heatmap-cell level-4" />
            <span>More</span>
          </div>
        </div>
      ) : null}
    </>
  );
}

// Buckets a day's tracked ms into a fixed 0-4 intensity level for the
// sequential single-hue ramp (see .heatmap-cell.level-* in styles.css).
function intensityLevel(ms) {
  const hours = ms / 3600000;
  if (hours <= 0) return 0;
  if (hours <= 2) return 1;
  if (hours <= 4) return 2;
  if (hours <= 6) return 3;
  return 4;
}

// Groups a flat, chronological list of {date, ms} into Sunday-first week
// columns — the standard GitHub-contributions layout, independent of the
// app's configured first_day_of_week (which governs reports, not this widget).
function groupIntoWeeks(days) {
  const weeks = [];
  let current = new Array(7).fill(null);
  for (const day of days) {
    const [y, m, d] = day.date.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    current[weekday] = day;
    if (weekday === 6) {
      weeks.push(current);
      current = new Array(7).fill(null);
    }
  }
  if (current.some((d) => d !== null)) weeks.push(current);
  return weeks;
}

function YearHeatmap({ days }) {
  const weeks = groupIntoWeeks(days);
  return (
    <div className="heatmap-scroll">
      <div className="heatmap" role="img" aria-label="Tracked time per day over the last year">
        {weeks.map((week, i) => (
          <div className="heatmap-week" key={i}>
            {week.map((day, j) =>
              day ? (
                <div
                  key={day.date}
                  className={`heatmap-cell level-${intensityLevel(day.ms)}`}
                  title={`${day.date}: ${day.ms > 0 ? formatDuration(day.ms) + ' h' : 'no tracked time'}`}
                />
              ) : (
                <div key={j} className="heatmap-cell" style={{ visibility: 'hidden' }} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyBars({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.ms));
  return (
    <div className="bar-chart" role="img" aria-label="Tracked time per day">
      {daily.map((d) => {
        const pct = (d.ms / max) * 100;
        const label = d.date.slice(5); // MM-DD
        return (
          <div className="bar-col" key={d.date} title={`${d.date}: ${formatDuration(d.ms)} h`}>
            <span className="bar-value">{d.ms > 0 ? formatDuration(d.ms) : ''}</span>
            <div className="bar" style={{ height: `${pct}%` }} />
            <span className="bar-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function CategoryBreakdown({ breakdown }) {
  if (!breakdown.length) return <Empty>No tracked time in this period.</Empty>;
  const total = breakdown.reduce((s, b) => s + b.ms, 0);
  return (
    <div>
      {breakdown.map((b) => {
        const pct = total > 0 ? (b.ms / total) * 100 : 0;
        return (
          <div className="breakdown-row" key={b.categoryId ?? 'none'} title={`${b.name}: ${formatDuration(b.ms)} h`}>
            <span className="swatch" style={{ width: 12, height: 12, borderRadius: '50%', background: b.color, flex: '0 0 auto' }} />
            <span style={{ flex: '0 0 160px', color: 'var(--ink)', fontSize: 14 }}>{b.name}</span>
            <div className="breakdown-bar-track">
              <div className="breakdown-bar-fill" style={{ width: `${pct}%`, background: b.color }} />
            </div>
            <span style={{ flex: '0 0 70px', textAlign: 'right', fontSize: 14, color: 'var(--body)' }}>
              {formatDuration(b.ms)} h
            </span>
          </div>
        );
      })}
    </div>
  );
}
