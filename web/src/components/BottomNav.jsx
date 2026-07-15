// Fixed bottom tab bar shown on phone-sized viewports. Icons are small inline
// SVGs (no icon library) matching the app's monochrome, near-black style.
const ICONS = {
  dashboard: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="12" width="4" height="8" />
      <rect x="10" y="7" width="4" height="13" />
      <rect x="16" y="4" width="4" height="16" />
    </svg>
  ),
  track: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  reports: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
    </svg>
  ),
  categories: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12.5 12.5 20a1.5 1.5 0 0 1-2.1 0L3 12.5V4h8.5l8.5 8.5z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
};

export default function BottomNav({ views, active, onSelect }) {
  return (
    <nav className="bottom-nav">
      {views.map((v) => (
        <button
          key={v.id}
          className={`bottom-nav-item${active === v.id ? ' active' : ''}`}
          onClick={() => onSelect(v.id)}
        >
          {ICONS[v.id]}
          <span>{v.label}</span>
        </button>
      ))}
    </nav>
  );
}
