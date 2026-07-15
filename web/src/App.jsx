import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { AppContext } from './context.jsx';
import { Toast } from './components/ui.jsx';
import Login from './views/Login.jsx';
import Dashboard from './views/Dashboard.jsx';
import Track from './views/Track.jsx';
import Reports from './views/Reports.jsx';
import Categories from './views/Categories.jsx';

const VIEWS = [
  { id: 'dashboard', label: 'Dashboard', Component: Dashboard },
  { id: 'track', label: 'Track', Component: Track },
  { id: 'reports', label: 'Reports', Component: Reports },
  { id: 'categories', label: 'Categories', Component: Categories },
];

export default function App() {
  const [settings, setSettings] = useState(null);
  const [authed, setAuthed] = useState(false);
  const [categories, setCategories] = useState([]);
  const [view, setView] = useState('dashboard');
  const [toast, setToast] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshCategories = useCallback(async () => {
    try {
      setCategories(await api.listCategories(true));
    } catch (err) {
      if (err.status !== 401) showToast(err.message, 'error');
    }
  }, [showToast]);

  // Load public settings first; they tell us whether auth is required.
  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        document.title = s.title;
        if (!s.authRequired) setAuthed(true);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  // Once authenticated, load the category list.
  useEffect(() => {
    if (authed) refreshCategories();
  }, [authed, refreshCategories]);

  if (loadError) {
    return <div className="empty">Could not reach the server: {loadError}</div>;
  }
  if (!settings) {
    return <div className="empty">Loading…</div>;
  }
  if (!authed) {
    return <Login settings={settings} onSuccess={() => setAuthed(true)} />;
  }

  const Active = VIEWS.find((v) => v.id === view).Component;

  const ctx = { settings, categories, refreshCategories, showToast, setView };

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <header className="topnav">
          <div className="wordmark">
            <span className="dot" />
            {settings.title}
          </div>
          <nav className="nav-pill-group">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={`nav-pill${view === v.id ? ' active' : ''}`}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </nav>
          <div className="spacer" />
          {settings.authRequired ? (
            <button
              className="btn btn-secondary btn-sm hide-sm"
              onClick={async () => {
                await api.logout();
                setAuthed(false);
              }}
            >
              Sign out
            </button>
          ) : null}
        </header>

        <main className="main">
          <Active />
        </main>

        <footer className="footer">
          <div className="inner">
            <div className="wordmark">
              <span className="dot" />
              {settings.title}
            </div>
            <small>Self-hosted time tracking · SQLite · configured via YAML</small>
          </div>
        </footer>

        <Toast toast={toast} />
      </div>
    </AppContext.Provider>
  );
}
