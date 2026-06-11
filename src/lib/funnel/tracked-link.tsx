'use client';

/**
 * Next.js Link that fires a funnel event on click/keyboard activation.
 *
 * Counterpart to TrackMount (view beacons): use this when the signal is
 * intent, not arrival — e.g. the landing page's demo CTAs, where the
 * click event carries `placement` so the report can tell which surface
 * earned the visit. track() posts with `keepalive`, so the event
 * survives the route transition it precedes.
 *
 * Renders a plain <Link>; safe to use from server components.
 */
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { track } from './track';

interface TrackedLinkProps extends ComponentProps<typeof Link> {
  event: string;
  eventProperties?: Record<string, unknown>;
}

export function TrackedLink({ event, eventProperties, onClick, ...props }: TrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        track(event, eventProperties);
        onClick?.(e);
      }}
    />
  );
}
