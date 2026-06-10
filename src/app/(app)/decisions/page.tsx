/**
 * /decisions — private Decisions timeline (Plan 2026-06-06-002 Phase B U5).
 *
 * Server component, flag-gated on DECISIONS_ENABLED. Lists the user's
 * Actions across states in chronological-descending order, each linked
 * to its producing answer and forward to its outcome or booking.
 *
 * Absorbs the booking status seed: when DECISIONS_ENABLED is on, the
 * canonical booking list lives here; the marker route defers with a
 * compact pointer.
 */
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';
import type { Action, BookingRequest, ActionOutcome } from '@prisma/client';
import { buildMarkerTrajectory } from '@/lib/markers/trajectory';
import { diffLatestPanels, type MarkerChange, type PanelDiff } from '@/lib/markers/panel-diff';
import {
  changeClassificationLabel,
  changeDirectionGlyph,
} from '@/lib/markers/change-presentation';
import {
  BookingStatusList,
  type BookingRow,
} from '@/app/reveal/priorities/marker/[name]/booking-status-client';

export const dynamic = 'force-dynamic';

type TimelineAction = Action & {
  bookingRequests: BookingRequest[];
  outcomes: ActionOutcome[];
};

const STATE_LABELS: Record<string, string> = {
  suggested: 'Suggested',
  accepted: 'Accepted',
  completed: 'Completed',
  'outcome-measured': 'Outcome measured',
  dismissed: 'Dismissed',
};

const STATE_STYLES: Record<string, string> = {
  suggested: 'bg-amber-100 text-amber-800',
  accepted: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  'outcome-measured': 'bg-violet-100 text-violet-800',
  dismissed: 'bg-gray-100 text-gray-500',
};

export default async function DecisionsPage() {
  if (env.DECISIONS_ENABLED !== 'true') {
    redirect('/home');
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  const actions = await prisma.action.findMany({
    where: { userId: user.id },
    include: {
      bookingRequests: true,
      outcomes: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Unlinked bookings (P0 #2): concierge bookings with actionId = null — booked
  // for a marker that had no prior Ask action — are never reachable via
  // action.bookingRequests, so they'd vanish from this surface after the flag
  // flip (the marker route now points here). Surface them as their own rows so
  // they keep their cancel + one-time reveal affordances. Mirrors the count the
  // marker-route pointer reports (userId, not cancelled).
  const unlinkedBookings = await prisma.bookingRequest.findMany({
    where: { userId: user.id, actionId: null, status: { not: 'cancelled' } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, markerNames: true, status: true, createdAt: true },
  });
  const unlinkedRows: BookingRow[] = unlinkedBookings.map((b) => ({
    id: b.id,
    markerNames: safeJsonParse(b.markerNames),
    status: b.status,
    createdAt: b.createdAt.toISOString(),
  }));

  // "What changed since your last test" — only when the longitudinal surface
  // is on AND the user has a previous panel to compare against (plan U7).
  // Kicked off here so it runs concurrently with the trajectory counts below;
  // a diff failure degrades to a hidden card, never a 500 on the whole page.
  const panelDiffPromise: Promise<PanelDiff | null> =
    env.LONGITUDINAL_GRAPH_ENABLED === 'true'
      ? diffLatestPanels(prisma, user.id).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[decisions] panel diff failed (card hidden): ${msg}`);
          return null;
        })
      : Promise.resolve(null);

  // Trajectory point-count per outcome marker (#5): only render "See trajectory"
  // when there are ≥2 points to chart. Computed once for the markers actually
  // referenced by an outcome-measured card.
  const outcomeMarkers = Array.from(
    new Set(
      actions
        .filter((a) => a.state === 'outcome-measured' && a.markerName)
        .map((a) => a.markerName as string),
    ),
  );
  const trajectoryCounts = new Map<string, number>();
  await Promise.all(
    outcomeMarkers.map(async (name) => {
      const pts = await buildMarkerTrajectory(prisma, user.id, name);
      trajectoryCounts.set(name, pts.length);
    }),
  );

  const hasContent = actions.length > 0 || unlinkedRows.length > 0;

  const panelDiff = await panelDiffPromise;
  const showPanelDiff =
    panelDiff !== null && panelDiff.previousPanelAt !== null && panelDiff.changes.length > 0;

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <div className="max-w-xl mx-auto">
        <h1 className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
          Decisions
        </h1>
        <p className="mt-2 text-body text-text-secondary leading-relaxed">
          Actions you&rsquo;ve chosen to act on — from suggestion to outcome.
        </p>

        {showPanelDiff && panelDiff && <PanelDiffCard diff={panelDiff} />}

        {!hasContent ? (
          <div className="mt-16 text-center">
            <p className="text-body text-text-secondary">
              Decisions you act on appear here.
            </p>
            <a
              href="/ask"
              className="inline-block mt-4 font-medium text-accent hover:underline"
            >
              Start by asking a question →
            </a>
          </div>
        ) : (
          <div className="mt-10 space-y-4">
            {/* Active actions first, dismissed grouped at the bottom */}
            {renderActions(
              actions.filter((a) => a.state !== 'dismissed'),
              trajectoryCounts,
            )}
            {/* Unlinked concierge bookings (no originating action) — absorbed so
                they keep their cancel + reveal interactions (P0 #2). */}
            {unlinkedRows.length > 0 && <BookingStatusList bookings={unlinkedRows} />}
            {renderDismissed(
              actions.filter((a) => a.state === 'dismissed'),
              trajectoryCounts,
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function renderActions(actions: TimelineAction[], trajectoryCounts: Map<string, number>) {
  if (!actions.length) return null;
  return actions.map((action) => (
    <TimelineCard key={action.id} action={action} trajectoryCounts={trajectoryCounts} />
  ));
}

function renderDismissed(actions: TimelineAction[], trajectoryCounts: Map<string, number>) {
  if (!actions.length) return null;
  return (
    <div className="pt-6 mt-6 border-t border-border-subtle">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary mb-3">
        Dismissed
      </p>
      <div className="space-y-3 opacity-60">
        {actions.map((action) => (
          <TimelineCard key={action.id} action={action} trajectoryCounts={trajectoryCounts} />
        ))}
      </div>
    </div>
  );
}

function TimelineCard({
  action,
  trajectoryCounts,
}: {
  action: TimelineAction;
  trajectoryCounts: Map<string, number>;
}) {
  const isDismissed = action.state === 'dismissed';
  const isOutcome = action.state === 'outcome-measured';
  const booking = action.bookingRequests[0];
  const outcome = action.outcomes[0];

  return (
    <div
      className={`border rounded-card p-4 ${isDismissed ? 'border-border-subtle' : 'border-border'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Label */}
          <p className={`text-body leading-relaxed ${isDismissed ? 'text-text-tertiary' : 'text-text-primary'}`}>
            {action.label}
          </p>

          {/* Meta line */}
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
            {action.markerName && `${action.markerName} · `}
            {new Date(action.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
            {action.acceptedAt && ` · Accepted ${fmtDate(action.acceptedAt)}`}
            {action.completedAt && ` · Completed ${fmtDate(action.completedAt)}`}
          </p>

          {/* Before/after — outcome-measured only */}
          {isOutcome && outcome && (
            <p className="mt-2 font-mono text-[11px] text-text-primary">
              {outcome.beforeValue != null ? (
                <>
                  <span className="text-text-tertiary">{outcome.beforeValue} → </span>
                  <span className="font-semibold">{outcome.afterValue}</span>
                  <span className="text-text-tertiary"> {outcome.markerName}</span>
                </>
              ) : (
                <>
                  <span className="font-semibold">{outcome.afterValue}</span>
                  <span className="text-text-tertiary"> {outcome.markerName}</span>
                </>
              )}
            </p>
          )}

          {/* Linked booking */}
          {booking && (
            <p className="mt-1 font-mono text-[10px] text-text-tertiary">
              Booking: {booking.status} · Ref: {booking.id.slice(0, 8)}
            </p>
          )}
        </div>

        {/* State chip */}
        <span
          className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATE_STYLES[action.state] ?? 'bg-gray-100 text-gray-700'}`}
        >
          {STATE_LABELS[action.state] ?? action.state}
        </span>
      </div>

      {/* Links */}
      <div className="mt-3 flex items-center gap-4 font-mono text-[10px]">
        {action.chatMessageId && (
          <a
            href={`/ask#${action.chatMessageId}`}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
          >
            See answer →
          </a>
        )}
        {/* "See trajectory" only when there are ≥2 points to chart (#5): a
            1-point marker has nothing to plot, so the link would be dead. */}
        {isOutcome &&
          action.markerName &&
          (trajectoryCounts.get(action.markerName) ?? 0) >= 2 && (
            <a
              href={`/decisions/marker/${encodeURIComponent(action.markerName)}`}
              className="text-text-tertiary hover:text-text-secondary transition-colors"
            >
              See trajectory →
            </a>
          )}
      </div>
    </div>
  );
}

function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  // Pinned to UTC: panel/action dates are date-ish instants stored at UTC
  // midnight (reportCollectionDate); a server in a negative-offset timezone
  // would otherwise render the previous day.
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

// Chip colours per classification — descriptive, range-relative (never
// "good/bad"). Labels + arrow glyphs come from the shared change-presentation
// vocabulary so they can't drift from the canvas/list surfaces.
const CHANGE_CHIP_STYLE: Record<MarkerChange['classification'], string> = {
  improved: 'bg-emerald-100 text-emerald-800',
  worsened: 'bg-amber-100 text-amber-800',
  stable: 'bg-gray-100 text-gray-600',
  unclassified: 'bg-gray-100 text-gray-600',
  new: 'bg-blue-100 text-blue-800',
};

function PanelDiffCard({ diff }: { diff: PanelDiff }) {
  return (
    <div className="mt-8 border border-border rounded-card p-5 bg-surface">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
        What changed since your last test
      </p>
      <p className="mt-1 text-caption text-text-secondary">
        {fmtDate(diff.previousPanelAt!)} → {fmtDate(diff.latestPanelAt)}
      </p>
      <ul className="mt-4 space-y-2">
        {diff.changes.map((c) => {
          return (
            <li key={c.marker} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-body text-text-primary">{c.marker}</span>
              <span className="shrink-0 flex items-center gap-2 font-mono text-[11px]">
                <span className="text-text-primary">
                  {c.beforeValue != null && (
                    <span className="text-text-tertiary">{c.beforeValue} {changeDirectionGlyph(c.direction)} </span>
                  )}
                  <span className="font-semibold">{c.afterValue}</span>
                  {c.unit && <span className="text-text-tertiary"> {c.unit}</span>}
                </span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CHANGE_CHIP_STYLE[c.classification]}`}
                >
                  {changeClassificationLabel(c.classification)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-caption text-text-tertiary leading-relaxed">
        Changes are described relative to each marker&rsquo;s reference range. This is
        information to help you prepare for a conversation with a clinician, not medical advice.
      </p>
    </div>
  );
}

function safeJsonParse(v: string | null): string[] {
  if (!v) return [];
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
}
