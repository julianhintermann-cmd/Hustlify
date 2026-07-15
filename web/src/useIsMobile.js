import { useEffect, useState } from 'react';

const QUERY = '(max-width: 768px)';

// Tracks whether the viewport is currently phone-sized, updating live as the
// window resizes or a device rotates (matches the CSS breakpoint in styles.css).
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
