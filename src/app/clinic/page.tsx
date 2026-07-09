/**
 * /clinic — clinician review queue (pilot MVP plan 2026-07-04).
 *
 * Gating order mirrors /ops: flag off -> notFound(); no session ->
 * redirect('/sign-in'); signed-in non-clinician -> restricted message with
 * ZERO member data fetched. Clinicians are magic-link users on
 * CLINICIAN_ALLOWLIST — this page is the only surface (besides the review
 * detail below it) where one member's identity + panel data is shown to
 * someone who isn't that member; keep everything behind requireClinician
 * semantics.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { isClinicianReviewEnabled, isClinician } from '@/lib/review/config';
import { listPendingReviews, countRecentDocsWithoutReview } from '@/lib/review/queue';
import { parsePanelSummary } from '@/lib/review/snapshot';

export const dynamic = 'force-dynamic';

const RECONCILIATION_WINDOW_DAYS = 30;

export default async function ClinicPage() {
  if (!isClinicianReviewEnabled()) {
    notFound();
  }
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }
  if (!isClinician(user.email)) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-5">
        <p className="text-body text-text-secondary">This page is restricted to Morning Form clinicians.</p>
      </div>
    );
  }

  const since = new Date(Date.now() - RECONCILIATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [pending, missingReviews] = await Promise.all([
    listPendingReviews(prisma),
    countRecentDocsWithoutReview(prisma, since),
  ]);

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
          Clinic — result reviews
        </h1>
        <p className="mt-2 text-body text-text-secondary leading-relaxed">
          Signed in as {user.email}. Every ingested panel appears here for sign-off; approve or
          escalate each one.
        </p>

        {missingReviews > 0 && (
          <div className="mt-6 border border-border rounded-card p-4 bg-surface">
            <p className="text-caption text-text-secondary">
              Reconciliation: {missingReviews} lab document{missingReviews === 1 ? '' : 's'} from the
              last {RECONCILIATION_WINDOW_DAYS} days {missingReviews === 1 ? 'has' : 'have'} no review
              row (the creation hook is best-effort). Ask ops to investigate if this number keeps
              growing.
            </p>
          </div>
        )}

        {pending.length === 0 ? (
          <p className="mt-10 text-body text-text-secondary">No pending reviews. Queue is clear.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {pending.map((review) => {
              const summary = parsePanelSummary(review.panelSummary);
              const flaggedCount = summary?.markers.filter((m) => m.flaggedOutOfRange).length ?? 0;
              const markerCount = summary?.markers.length ?? 0;
              return (
                <li key={review.id} className="border border-border rounded-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body text-text-primary">
                        {review.user.name ?? review.user.email}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                        {review.user.email} · {review.sourceDocument?.sourceRef ?? 'document'} ·{' '}
                        {review.documentCapturedAt.toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </p>
                      <p className="mt-2 text-caption text-text-secondary">
                        {markerCount} marker{markerCount === 1 ? '' : 's'}
                        {flaggedCount > 0
                          ? ` · ${flaggedCount} flagged out of range by the lab`
                          : ' · none flagged by the lab'}
                      </p>
                    </div>
                    <Link
                      href={`/clinic/review/${review.id}`}
                      className="shrink-0 font-medium text-accent hover:underline text-body"
                    >
                      Review →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
