// Small shared presentational components used across the views.

export function StatTile({ label, value, unit, sub, tone }) {
  return (
    <div className="card stat-tile">
      <div className="label">{label}</div>
      <div className={`value${tone ? ' ' + tone : ''}`}>
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Badge({ color, children }) {
  return (
    <span className="badge">
      {color ? <span className="swatch" style={{ background: color }} /> : null}
      {children}
    </span>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast${toast.type === 'error' ? ' error' : ''}`}>
      <span>{toast.message}</span>
      {toast.action ? (
        <button className="toast-action" onClick={toast.action.onClick}>
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}
