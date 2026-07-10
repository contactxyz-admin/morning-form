/**
 * /clinic/review/[id] — a single panel's review detail: the member's
 * identity, the panelSummary snapshot (flagged rows first, relaying the
 * LAB's own out-of-range flag — Morning Form never infers abnormality), and
 * the approve/escalate decision panel.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { isClinicianReviewEnabled, isClinician } from '@/lib/review/config';
import { getReviewForClinician } from '@/lib/review/queue';
import { parsePanelSummary } from '@/lib/review/snapshot';
import { DecisionPanel } from './decision-panel';

export const dynamic = 'force-dynamic';

export default async function ClinicReviewPage({ params }: { params: { id: string } }) {
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

  const review = await getReviewForClinician(prisma, params.id);
  if (!review) {
    notFound();
  }
  const summary = parsePanelSummary(review.panelSummary);
  const markers = summary
    ? [...summary.markers].sort((a, b) => Number(b.flaggedOutOfRange) - Number(a.flaggedOutOfRange))
    : [];

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <div className="max-w-2xl mx-auto">
        <Link href="/clinic" className="font-mono text-[11px] text-text-tertiary hover:text-text-secondary">
          ← Queue
        </Link>
        <h1 className="mt-3 font-display font-light text-display-sm text-text-primary -tracking-[0.03em] leading-[1.1]">
          {review.user.name ?? review.user.email}
        </h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          {review.user.email} · {review.sourceDocument?.sourceRef ?? summary?.sourceRef ?? 'document'} ·{' '}
          {summary?.labProvider ?? 'lab unknown'} · collected{' '}
          {review.documentCapturedAt.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </p>

        {!summary ? (
          <p className="mt-8 text-body text-text-secondary">
            This review&rsquo;s stored panel snapshot could not be parsed — contact ops before deciding.
          </p>
        ) : (
          <div className="mt-8 border border-border rounded-card overflow-hidden">
            <table className="w-full text-caption">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary border-b border-border">
                  <th className="px-3 py-2">Marker</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Lab flag</th>
                </tr>
              </thead>
              <tbody>
                {markers.map((m) => (
                  <tr key={m.joinKey} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-3 py-2 text-text-primary">{m.displayName}</td>
                    <td className="px-3 py-2 font-mono text-text-primary">
                      {m.value}
                      {m.unit ? ` ${m.unit}` : ''}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-tertiary">
                      {m.referenceRangeLow ?? '–'}–{m.referenceRangeHigh ?? '–'}
                    </td>
                    <td className="px-3 py-2">
                      {m.flaggedOutOfRange ? (
                        <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800">
                          Out of range
                        </span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {review.status === 'pending' ? (
          summary && (
            <DecisionPanel
              reviewId={review.id}
              markers={markers.map((m) => ({
                joinKey: m.joinKey,
                displayName: m.displayName,
                flaggedOutOfRange: m.flaggedOutOfRange,
              }))}
            />
          )
        ) : (
          <div className="mt-8 border border-border rounded-card p-4 bg-surface">
            <p className="text-body text-text-primary">
              {review.status === 'approved' ? 'Approved' : 'Escalated'} by {review.clinicianEmail}
              {review.decidedAt
                ? ` on ${review.decidedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })}`
                : ''}
              .
            </p>
            {review.escalationReason && (
              <p className="mt-2 text-caption text-text-secondary">Reason: {review.escalationReason}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
