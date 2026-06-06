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
import type { ActionState } from '@/lib/actions/lifecycle';
import type { Action, BookingRequest, ActionOutcome } from '@prisma/client';

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

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <div className="max-w-xl mx-auto">
        <h1 className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
          Decisions
        </h1>
        <p className="mt-2 text-body text-text-secondary leading-relaxed">
          Actions you&rsquo;ve chosen to act on — from suggestion to outcome.
        </p>

        {actions.length === 0 ? (
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
            {renderActions(actions.filter((a) => a.state !== 'dismissed'))}
            {renderDismissed(actions.filter((a) => a.state === 'dismissed'))}
          </div>
        )}
      </div>
    </div>
  );
}

function renderActions(actions: TimelineAction[]) {
  if (!actions.length) return null;
  return actions.map((action) => (
    <TimelineCard key={action.id} action={action} />
  ));
}

function renderDismissed(actions: TimelineAction[]) {
  if (!actions.length) return null;
  return (
    <div className="pt-6 mt-6 border-t border-border-subtle">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary mb-3">
        Dismissed
      </p>
      <div className="space-y-3 opacity-60">
        {actions.map((action) => (
          <TimelineCard key={action.id} action={action} />
        ))}
      </div>
    </div>
  );
}

function TimelineCard({ action }: { action: TimelineAction }) {
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
        {isOutcome && action.markerName && (
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
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
  });
}
