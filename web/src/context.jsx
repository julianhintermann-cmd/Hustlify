import { createContext, useContext } from 'react';

// Shared application context: server settings, category list (+ refresh) and a
// toast helper. Populated by <App> once settings and categories are loaded.
export const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppContext');
  return ctx;
}
