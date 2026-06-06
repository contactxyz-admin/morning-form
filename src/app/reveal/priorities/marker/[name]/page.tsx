/**
 * Marker detail — "How to get this tested" view (Plan 2026-06-06-001 U2).
 *
 * Server component resolving marker name + archetype from params/searchParams.
 * Renders: what the test involves, then the three routes in order:
 *   1. MorningForm arranges it (concierge, flag-gated)
 *   2. Through your GP/clinician (always)
 *   3. Order it yourself (suppressed when panelAvailability: 'neither')
 *
 * Upload is the secondary action.
 */
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { resolvePrioritiesContent } from '@/lib/priority-marker-engine';
import { getTestRouteMarket, type Market } from '@/../content/test-routes/index';
import { env } from '@/lib/env';
import { BookingRequestForm } from './booking-request-form';
import { BookingStatusList, type BookingRow } from './booking-status-client';

interface Props {
  params: { name: string };
  searchParams: { archetype?: string };
}

export default async function MarkerDetailPage({ params, searchParams }: Props) {
  // Gate on PRIORITY_MARKERS_ENABLED — mirrors /reveal/priorities/page.tsx so
  // the clinical detail content isn't reachable by direct URL before launch
  // (review correctness P3).
  if ((process.env.PRIORITY_MARKERS_ENABLED ?? '') !== 'true') {
    notFound();
  }

  const user = await getCurrentUser();
  // Derive market. Not authenticated → default to UK for the unauthenticated
  // preview path (the priorities surface is auth-gated anyway — this is belt-
  // and-suspenders).
  const market: Market = user?.signupMarket === 'us' ? 'us' : 'uk';
  const markerName = decodeURIComponent(params.name);

  // Resolve archetype — prefer the searchParam, fall back to user's stateProfile.
  let archetypeKey = searchParams.archetype;
  if (!archetypeKey && user) {
    const sp = await prisma.stateProfile.findUnique({
      where: { userId: user.id },
      select: { archetype: true },
    });
    archetypeKey = sp?.archetype;
  }

  // Look up the marker content.
  let marker: {
    markerName: string;
    rationale: string;
    category: string;
    panelAvailability: 'uk' | 'us' | 'both' | 'neither';
    sampleType: string;
    fastingRequired: boolean;
    fastingNote?: string;
  } | null = null;

  if (archetypeKey) {
    const content = resolvePrioritiesContent(archetypeKey);
    if (content) {
      marker = content.markers.find((m) => m.markerName === markerName) ?? null;
    }
  }

  if (!marker) notFound();

  const testRoutes = getTestRouteMarket(market);
  const conciergeEnabled = (process.env.CONCIERGE_BOOKING_ENABLED ?? env.CONCIERGE_BOOKING_ENABLED ?? '') === 'true';
  const showConcierge = conciergeEnabled && testRoutes.conciergeAvailable;
  const showSelfOrder = marker.panelAvailability !== 'neither';

  // Link an open `measure` Action for this marker when one exists (R-C). Only
  // the user's own Actions — ownership re-checked server-side on POST.
  let linkActionId: string | undefined;
  if (showConcierge && user) {
    const action = await prisma.action.findFirst({
      where: { userId: user.id, verb: 'measure', markerName: marker.markerName },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    linkActionId = action?.id;
  }

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <div className="max-w-xl mx-auto">
        {/* Back link */}
        <a
          href="/reveal/priorities"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-text-secondary transition-colors mb-10"
        >
          ← Back to priorities
        </a>

        {/* Marker header */}
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
          {marker.category}
        </span>
        <h1 className="mt-2 font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
          {marker.markerName}
        </h1>
        <p className="mt-4 text-body-lg text-text-secondary leading-relaxed">
          {marker.rationale}
        </p>

        {/* What the test involves */}
        <div className="mt-10 pt-8 border-t border-border-subtle">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary mb-3">
            What the test involves
          </h2>
          <p className="text-body text-text-secondary leading-relaxed">
            {marker.sampleType}.
            {marker.fastingRequired && ' Fasting is required before the draw.'}
            {marker.fastingNote && ` ${marker.fastingNote}.`}
          </p>
        </div>

        {/* Route 1: Concierge */}
        {showConcierge && (
          <div className="mt-8 pt-6 border-t border-border-subtle">
            <div className="flex items-start gap-3">
              <span className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                Recommended
              </span>
            </div>
            <h3 className="mt-2 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
              MorningForm arranges it
            </h3>
            <BookingRequestForm
              markerNames={[marker.markerName]}
              market={market}
              partnerNames={testRoutes.conciergePartnerNames}
              actionId={linkActionId}
            />
          </div>
        )}

        {/* Route 2: GP */}
        <div className="mt-8 pt-6 border-t border-border-subtle">
          <h3 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
            Through your GP
          </h3>
          <p className="mt-2 text-body text-text-secondary leading-relaxed">
            {testRoutes.gpRouteLabel}
          </p>
        </div>

        {/* Route 3: Self-order */}
        {showSelfOrder && (
          <div className="mt-8 pt-6 border-t border-border-subtle">
            <h3 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
              Order it yourself
            </h3>
            <p className="mt-2 text-body text-text-secondary leading-relaxed">
              Self-order blood tests are available in {market === 'uk' ? 'the UK' : 'most US states'}.
            </p>
            <ul className="mt-4 space-y-4">
              {testRoutes.selfOrderPartners.map((partner: { name: string; description: string; priceRange: string; url: string }) => (
                <li key={partner.name} className="border border-border rounded-card p-4">
                  <p className="font-medium text-body text-text-primary">{partner.name}</p>
                  <p className="mt-1 text-caption text-text-secondary leading-relaxed">
                    {partner.description}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                    {partner.priceRange}
                  </p>
                  <a
                    href={partner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 font-mono text-[11px] text-text-secondary hover:text-text-primary underline underline-offset-2"
                  >
                    Visit {partner.name} →
                  </a>
                </li>
              ))}
            </ul>
            {market === 'us' && testRoutes.blockedStateGuidance && (
              <p className="mt-4 text-caption text-text-tertiary leading-relaxed">
                {testRoutes.blockedStateGuidance}
              </p>
            )}
          </div>
        )}

        {/* Secondary: upload */}
        <div className="mt-10 pt-6 border-t border-border-subtle">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary mb-3">
            Already have results?
          </p>
          <a
            href="/intake"
            className="inline-flex px-5 py-2.5 rounded-card border border-border text-body text-text-secondary hover:border-text-tertiary transition-colors"
          >
            Upload your blood panel →
          </a>
        </div>

        {/* Your test requests — Phase B timeline seed. Read-only list of
            the user's booking requests. Collapses into the Decisions
            timeline when Phase B builds it. */}
        {user && <UserBookingRequests userId={user.id} />}
      </div>
    </div>
  );
}

/**
 * Read-only status block: the user's booking requests. This is the Phase B
 * timeline seed — fetches rows server-side, hands serializable data to the
 * client component which owns the cancel (JS fetch, JSON) + one-time in-app
 * code-reveal interactions.
 */
async function UserBookingRequests({ userId }: { userId: string }) {
  const decisionsEnabled = env.DECISIONS_ENABLED === 'true';

  if (decisionsEnabled) {
    // When the Decisions timeline is live, the canonical booking list lives
    // there. Show a compact pointer so a user navigating from a marker still
    // finds their request — no duplicate list.
    const count = await prisma.bookingRequest.count({
      where: { userId, status: { not: 'cancelled' } },
    });
    if (count === 0) return null;
    return (
      <div className="mt-10 pt-6 border-t border-border-subtle">
        <a
          href="/decisions"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          View your test requests in Decisions →
        </a>
      </div>
    );
  }

  const bookings = await prisma.bookingRequest.findMany({
    where: { userId, status: { not: 'cancelled' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, markerNames: true, status: true, createdAt: true },
  });

  if (!bookings.length) return null;

  const rows: BookingRow[] = bookings.map((b) => ({
    id: b.id,
    markerNames: safeJsonParse(b.markerNames),
    status: b.status,
    createdAt: b.createdAt.toISOString(),
  }));

  return <BookingStatusList bookings={rows} />;
}

function safeJsonParse(v: string | null): string[] {
  if (!v) return [];
  try { return JSON.parse(v); } catch { return []; }
}
