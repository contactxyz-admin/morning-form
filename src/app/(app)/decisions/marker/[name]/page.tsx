/**
 * /decisions/marker/[name] — marker trajectory sub-route (Plan 2026-06-06-002 U5).
 *
 * Private, flag-gated on DECISIONS_ENABLED. Renders the unified marker
 * trajectory (lab + wearable merged via buildMarkerTrajectory) using the shared
 * Sparkline. ≥2 points → chart; 1 point → single labelled value; 0 → empty
 * state. Reachable from the outcome-measured card's "See trajectory →" link
 * (which is itself suppressed below 2 points — #5).
 */
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';
import { buildMarkerTrajectory } from '@/lib/markers/trajectory';
import { Sparkline } from '@/components/ui/sparkline';

export const dynamic = 'force-dynamic';

interface Props {
  params: { name: string };
}

export default async function MarkerTrajectoryPage({ params }: Props) {
  if (env.DECISIONS_ENABLED !== 'true') {
    redirect('/home');
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  const markerName = decodeURIComponent(params.name);
  const points = await buildMarkerTrajectory(prisma, user.id, markerName);
  const unit = points.find((p) => p.unit)?.unit ?? '';

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <div className="max-w-xl mx-auto">
        <a
          href="/decisions"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-text-secondary transition-colors mb-10"
        >
          ← Back to decisions
        </a>

        <h1 className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
          {markerName}
        </h1>

        {points.length === 0 && (
          <p className="mt-8 text-body text-text-secondary leading-relaxed">
            No trajectory data yet for this marker.
          </p>
        )}

        {points.length === 1 && (
          <div className="mt-8">
            <p className="font-display font-light text-display-sm text-text-primary">
              {points[0].value}
              {unit && <span className="text-text-tertiary text-heading"> {unit}</span>}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
              {fmtShort(points[0].timestamp)}
            </p>
          </div>
        )}

        {points.length >= 2 && (
          <div className="mt-8">
            {unit && (
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary mb-2">
                {unit}
              </p>
            )}
            {/* Sparkline takes values oldest→newest; the reader returns newest
                first, so reverse for the chart. */}
            <Sparkline
              values={[...points].reverse().map((p) => p.value)}
              ariaLabel={`${markerName} trajectory over ${points.length} points`}
            />
            <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
              <span>{fmtShort(points[points.length - 1].timestamp)}</span>
              <span>{fmtShort(points[0].timestamp)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtShort(iso: string): string {
  // UTC-pinned: reading dates are UTC-midnight instants; a negative-offset
  // server would otherwise label them with the previous day.
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}
