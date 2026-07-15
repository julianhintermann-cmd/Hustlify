import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../context.jsx';
import { useIsMobile } from '../useIsMobile.js';
import { Empty } from '../components/ui.jsx';
import {
  formatStopwatch,
  formatDuration,
  formatClock,
  formatDate,
  localInputToTs,
  tsToLocalInput,
  todayInTz,
} from '../format.js';

const UNDO_WINDOW_MS = 6000;

export default function Track() {
  const { categories, settings, showToast } = useApp();
  const isMobile = useIsMobile();
  const tz = settings.timezone;
  const activeCategories = useMemo(() => categories.filter((c) => !c.archived), [categories]);

  const [running, setRunning] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [timerCat, setTimerCat] = useState('');
  const [timerNote, setTimerNote] = useState('');

  const [entries, setEntries] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', category_id: '', q: '' });
  const [editing, setEditing] = useState(null);
  const [idlePrompt, setIdlePrompt] = useState(null);
  const tick = useRef(null);
  const lastTickRef = useRef(Date.now());
  const pendingDeletes = useRef(new Map());

  const refreshTimer = useCallback(async () => {
    try {
      const { running } = await api.getTimer();
      setRunning(running);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [showToast]);

  const refreshEntries = useCallback(async () => {
    try {
      const list = await api.listEntries(filters);
      // A deletion may still be pending its undo window — don't let a refetch
      // in the meantime (e.g. adding another entry) bring it back early.
      setEntries(list.filter((e) => !pendingDeletes.current.has(e.id)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [filters, showToast]);

  useEffect(() => {
    refreshTimer();
  }, [refreshTimer]);

  useEffect(() => {
    refreshEntries();
  }, [refreshEntries]);

  // Live stopwatch tick only while a timer runs. Each tick also compares the
  // actual elapsed time against the expected 1s step: a much larger gap means
  // the tab was hidden/throttled or the device slept — i.e. the user was away.
  useEffect(() => {
    if (running) {
      lastTickRef.current = Date.now();
      tick.current = setInterval(() => {
        const nowTs = Date.now();
        const idleMinutes = settings.idleDetectionMinutes || 0;
        if (idleMinutes > 0) {
          const gapMs = nowTs - lastTickRef.current;
          const thresholdMs = Math.max(idleMinutes * 60000, 90000);
          if (gapMs > thresholdMs) {
            setIdlePrompt({ awayStartTs: lastTickRef.current, resumedAtTs: nowTs });
          }
        }
        lastTickRef.current = nowTs;
        setNow(nowTs);
      }, 1000);
      return () => clearInterval(tick.current);
    }
  }, [running, settings.idleDetectionMinutes]);

  async function startTimer() {
    try {
      await api.startTimer({ categoryId: timerCat || null, note: timerNote });
      setTimerNote('');
      setNow(Date.now());
      await refreshTimer();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function stopTimer() {
    try {
      await api.stopTimer();
      await refreshTimer();
      await refreshEntries();
      showToast('Timer stopped and saved');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Optimistic delete: the row disappears immediately, and a toast offers a
  // few seconds to undo before the deletion is actually sent to the server.
  function removeEntry(id) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    setEntries((list) => list.filter((e) => e.id !== id));

    const timer = setTimeout(async () => {
      pendingDeletes.current.delete(id);
      try {
        await api.deleteEntry(id);
      } catch (err) {
        showToast(err.message, 'error');
        await refreshEntries();
      }
    }, UNDO_WINDOW_MS);
    pendingDeletes.current.set(id, { entry, timer });

    showToast('Entry deleted', {
      action: {
        label: 'Undo',
        onClick: () => {
          const pending = pendingDeletes.current.get(id);
          if (!pending) return;
          clearTimeout(pending.timer);
          pendingDeletes.current.delete(id);
          setEntries((list) => [...list, pending.entry].sort((a, b) => b.startTs - a.startTs));
        },
      },
      duration: UNDO_WINDOW_MS,
    });
  }

  async function startAgain(entry) {
    try {
      await api.startTimer({ categoryId: entry.categoryId || null, note: entry.note || '' });
      await refreshTimer();
      showToast('Timer started');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function keepIdleTime() {
    setIdlePrompt(null);
  }

  async function discardIdleTime() {
    if (!running || !idlePrompt) return;
    const gapMs = idlePrompt.resumedAtTs - idlePrompt.awayStartTs;
    try {
      await api.updateEntry(running.id, { startTs: running.startTs + gapMs });
      await refreshTimer();
      showToast('Idle time discarded');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIdlePrompt(null);
    }
  }

  async function stopAtAwayPoint() {
    if (!running || !idlePrompt) return;
    try {
      await api.updateEntry(running.id, { endTs: idlePrompt.awayStartTs });
      await refreshTimer();
      await refreshEntries();
      showToast('Timer stopped at the point you went idle');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIdlePrompt(null);
    }
  }

  const elapsed = running ? now - running.startTs : 0;
  const warningThresholdMs = (settings.longTimerWarningHours || 0) * 3600000;
  const showLongTimerWarning = running && warningThresholdMs > 0 && elapsed > warningThresholdMs;

  return (
    <>
      <div className="page-head">
        <h1>Track</h1>
        <p>Run the timer or add time by hand, then review and edit your entries.</p>
      </div>

      {/* Timer */}
      <div className="card timer-card" style={{ marginBottom: 24 }}>
        <div className="label muted">{running ? 'Timer running' : 'Timer ready'}</div>
        <div className="timer-display">{formatStopwatch(elapsed)}</div>
        {running ? (
          <>
            <div className="muted" style={{ marginBottom: 16 }}>
              {running.categoryName ? running.categoryName : 'Uncategorized'}
              {running.note ? ` · ${running.note}` : ''}
            </div>
            {showLongTimerWarning ? (
              <div className="warning-banner">
                Still running after {formatDuration(elapsed)} h — did you forget to stop it?
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setEditing(running)}>
                Edit
              </button>
              <button className="btn btn-primary btn-lg" onClick={stopTimer}>
                Stop timer
              </button>
            </div>
          </>
        ) : (
          <div className="row timer-start-row" style={{ maxWidth: 620, margin: '0 auto' }}>
            <select className="input" value={timerCat} onChange={(e) => setTimerCat(e.target.value)}>
              <option value="">Uncategorized</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="What are you working on?"
              value={timerNote}
              onChange={(e) => setTimerNote(e.target.value)}
              style={{ flex: 2 }}
            />
            <button className="btn btn-primary" onClick={startTimer} style={{ flex: '0 0 auto' }}>
              Start timer
            </button>
          </div>
        )}
      </div>

      {/* Manual entry */}
      <ManualEntry
        tz={tz}
        categories={activeCategories}
        onAdded={() => {
          refreshEntries();
          showToast('Entry added');
        }}
        showToast={showToast}
      />

      {/* Filters + list */}
      <div className="section-title" style={{ marginTop: 32 }}>
        <h2>Entries</h2>
      </div>
      <div className="card-outline" style={{ marginBottom: 16 }}>
        <div className="row">
          <div>
            <label>From</label>
            <input
              type="date"
              className="input"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div>
            <label>To</label>
            <input
              type="date"
              className="input"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
          <div>
            <label>Category</label>
            <select
              className="input"
              value={filters.category_id}
              onChange={(e) => setFilters((f) => ({ ...f, category_id: e.target.value }))}
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 2 }}>
            <label>Search notes</label>
            <input
              className="input"
              placeholder="Search…"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <Empty>No entries yet. Start the timer or add one manually.</Empty>
      ) : isMobile ? (
        <div>
          {entries.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              tz={tz}
              timerRunning={!!running}
              onStartAgain={() => startAgain(e)}
              onEdit={() => setEditing(e)}
              onDelete={() => removeEntry(e.id)}
            />
          ))}
        </div>
      ) : (
        <div className="card-outline" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Duration</th>
                <th>Category</th>
                <th>Note</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.startTs, tz)}</td>
                  <td>
                    {formatClock(e.startTs, tz)}
                    {e.running ? ' · running' : `–${formatClock(e.endTs, tz)}`}
                  </td>
                  <td>{e.running ? '—' : `${formatDuration(e.durationMs)} h`}</td>
                  <td>
                    {e.categoryColor ? (
                      <span className="badge">
                        <span className="swatch" style={{ background: e.categoryColor }} />
                        {e.categoryName}
                      </span>
                    ) : (
                      <span className="muted">Uncategorized</span>
                    )}
                  </td>
                  <td>{e.note || <span className="muted">—</span>}</td>
                  <td className="actions">
                    {!e.running && (
                      <button
                        className="icon-btn"
                        onClick={() => startAgain(e)}
                        disabled={!!running}
                        title={running ? 'Stop the current timer first' : 'Start a new timer with this category and note'}
                      >
                        Start again
                      </button>
                    )}{' '}
                    <button className="icon-btn" onClick={() => setEditing(e)}>
                      Edit
                    </button>{' '}
                    <button className="icon-btn danger" onClick={() => removeEntry(e.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <EntryEditor
          entry={editing}
          tz={tz}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            const wasRunning = editing.running;
            setEditing(null);
            refreshEntries();
            if (wasRunning) refreshTimer();
            showToast('Entry updated');
          }}
          showToast={showToast}
        />
      ) : null}

      {idlePrompt ? (
        <IdlePrompt
          gapMs={idlePrompt.resumedAtTs - idlePrompt.awayStartTs}
          onKeep={keepIdleTime}
          onDiscard={discardIdleTime}
          onStop={stopAtAwayPoint}
        />
      ) : null}
    </>
  );
}

// Shown when the running timer's tick reveals a large gap since the last one
// — the tab was likely hidden/throttled or the device slept. Lets the user
// decide what that idle time should count as.
function IdlePrompt({ gapMs, onKeep, onDiscard, onStop }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3 style={{ marginBottom: 12 }}>Welcome back</h3>
        <p className="muted" style={{ marginBottom: 20 }}>
          This tab looks like it was inactive for about {formatDuration(gapMs)} h. What should
          happen to that time?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-primary" onClick={onDiscard}>
            Discard the idle time
          </button>
          <button className="btn btn-secondary" onClick={onStop}>
            Stop the timer at that point
          </button>
          <button className="btn btn-secondary" onClick={onKeep}>
            Keep it — I was working
          </button>
        </div>
      </div>
    </div>
  );
}

// Card representation of a time entry, used on phone-sized viewports instead
// of the entries table (a wide table doesn't fit or scroll well on a phone).
function EntryCard({ entry: e, tz, timerRunning, onStartAgain, onEdit, onDelete }) {
  return (
    <div className="entry-card">
      <div className="entry-card-row">
        <div>
          <div>{formatDate(e.startTs, tz)}</div>
          <div className="entry-card-meta">
            {formatClock(e.startTs, tz)}
            {e.running ? ' · running' : `–${formatClock(e.endTs, tz)}`}
            {!e.running ? ` · ${formatDuration(e.durationMs)} h` : ''}
          </div>
        </div>
        {e.categoryColor ? (
          <span className="badge">
            <span className="swatch" style={{ background: e.categoryColor }} />
            {e.categoryName}
          </span>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>Uncategorized</span>
        )}
      </div>
      {e.note ? <div className="entry-card-note">{e.note}</div> : null}
      <div className="entry-card-actions">
        {!e.running && (
          <button
            className="icon-btn"
            onClick={onStartAgain}
            disabled={timerRunning}
            title={timerRunning ? 'Stop the current timer first' : 'Start a new timer with this category and note'}
          >
            Start again
          </button>
        )}
        <button className="icon-btn" onClick={onEdit}>
          Edit
        </button>
        <button className="icon-btn danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function ManualEntry({ tz, categories, onAdded, showToast }) {
  const today = todayInTz(tz);
  const [start, setStart] = useState(`${today}T09:00`);
  const [end, setEnd] = useState(`${today}T17:00`);
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await api.createEntry({
        categoryId: categoryId || null,
        startTs: localInputToTs(start, tz),
        endTs: localInputToTs(end, tz),
        note,
      });
      setNote('');
      onAdded();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-outline">
      <h3 style={{ marginBottom: 16 }}>Add time manually</h3>
      <div className="row">
        <div>
          <label>Start</label>
          <input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label>End</label>
          <input type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div>
          <label>Category</label>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 3 }}>
          <label>Note</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional description" />
        </div>
        <button className="btn btn-primary" onClick={add} disabled={busy} style={{ flex: '0 0 auto' }}>
          Add entry
        </button>
      </div>
    </div>
  );
}

function EntryEditor({ entry, tz, categories, onClose, onSaved, showToast }) {
  const isRunning = entry.running;
  const [start, setStart] = useState(tsToLocalInput(entry.startTs, tz));
  const [end, setEnd] = useState(isRunning ? '' : tsToLocalInput(entry.endTs, tz));
  const [categoryId, setCategoryId] = useState(entry.categoryId ?? '');
  const [note, setNote] = useState(entry.note || '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const patch = {
        categoryId: categoryId || null,
        startTs: localInputToTs(start, tz),
        note,
      };
      if (!isRunning) patch.endTs = localInputToTs(end, tz);
      await api.updateEntry(entry.id, patch);
      onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>{isRunning ? 'Edit running timer' : 'Edit entry'}</h3>
        <div className="field">
          <label>Start</label>
          <input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        {isRunning ? (
          <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
            The timer is still running — stop it to set an end time.
          </p>
        ) : (
          <div className="field">
            <label>End</label>
            <input type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label>Category</label>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Note</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
