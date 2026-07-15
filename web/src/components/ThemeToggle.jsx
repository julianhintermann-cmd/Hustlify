const ORDER = ['auto', 'light', 'dark'];
const LABELS = { auto: 'System', light: 'Light', dark: 'Dark' };

const ICONS = {
  light: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  ),
  auto: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </svg>
  ),
};

// Cycles System -> Light -> Dark -> System. Shows the current setting (not
// necessarily the resolved appearance) so "System" stays visibly distinct
// from an explicit choice even when it currently resolves to the same look.
export default function ThemeToggle({ theme, onChange }) {
  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    onChange(next);
  }

  return (
    <button
      className="btn-icon-circular"
      onClick={cycle}
      title={`Theme: ${LABELS[theme]} (click to change)`}
      aria-label={`Theme: ${LABELS[theme]}`}
    >
      {ICONS[theme]}
    </button>
  );
}
