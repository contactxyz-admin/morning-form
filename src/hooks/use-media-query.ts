import { useEffect, useState } from 'react';

/**
 * Match a CSS media query. Returns `false` on the server and on the first
 * client render, then flips to the real value after mount. Consumers that
 * need true SSR parity should guard render until `mounted` or accept the
 * single-frame flip.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
