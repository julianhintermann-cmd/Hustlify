import { useState } from 'react';
import { api } from '../api.js';

// Shown only when the server reports authRequired. A single password field.
export default function Login({ settings, onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <form className="card" style={{ width: 360, maxWidth: '100%' }} onSubmit={submit}>
        <div className="wordmark" style={{ marginBottom: 8 }}>
          <span className="dot" />
          {settings.title}
        </div>
        <h2 style={{ marginBottom: 20 }}>Sign in</h2>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input
            id="pw"
            className="input"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <div style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{error}</div>
        ) : null}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
