'use client';

/**
 * Fires a single track() call on first mount. Drop into a server
 * component (e.g. landing page) when you need a client-side beacon
 * without converting the whole page to "use client".
 *
 * Renders nothing.
 */
import { useEffect } from 'react';
import { track } from './track';

interface Props {
  event: string;
  properties?: Record<string, unknown>;
}

export function TrackMount({ event, properties }: Props): null {
  useEffect(() => {
    track(event, properties);
    // Intentionally no deps — fire exactly once per mount, even if the
    // properties object reference changes between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
