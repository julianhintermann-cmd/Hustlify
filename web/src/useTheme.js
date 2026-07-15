import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'hustlify-theme'; // 'light' | 'dark' | 'auto'

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Mirrors the inline script in index.html, which sets the initial attribute
// before first paint to avoid a flash of the wrong theme.
function applyTheme(theme) {
  const effective = theme === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
  document.documentElement.setAttribute('data-theme', effective);
}

// Tri-state theme (light/dark/auto), persisted in localStorage. "auto"
// follows the OS preference live, including changes while the app is open.
export function useTheme() {
  const [theme, setThemeState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'auto');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'auto') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('auto');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  return [theme, setTheme];
}
