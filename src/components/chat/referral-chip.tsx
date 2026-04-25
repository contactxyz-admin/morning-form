'use client';

/**
 * `ReferralChip` — visible-by-default surface for the general scribe's
 * `refer_to_specialist` consultations (Plan 2026-04-25-001 Unit 6).
 *
 * Renders a chip-with-expandable-summary above the assistant bubble. The
 * label attributes the answer to the consulted specialty by display name
 * (never the raw key) so the user's mental model is "team of specialists,"
 * not "black box AI." Stub specialties render a distinct variant — the
 * fallback message is plainly visible and labelled "not yet available."
 *
 * Accessibility:
 *   - Native `<details>` for keyboard + screen-reader expand/collapse.
 *   - The classification (when present) lands in the `title` attribute so
 *     hover/aria announces "specialist consultation, classification: X."
 *   - `data-audit-id` is rendered when a child audit row exists, giving
 *     ops a deep-link target for future "open this turn's audit" UX
 *     without yet committing to a route.
 */
import { cn } from '@/lib/utils';
import type { Referral } from '@/lib/chat/types';

interface Props {
  readonly referrals: readonly Referral[];
  readonly className?: string;
}

export function ReferralChips({ referrals, className }: Props) {
  if (referrals.length === 0) return null;
  return (
    <ul
      className={cn('flex flex-col gap-2', className)}
      aria-label="Specialist consultations"
    >
      {referrals.map((r, i) => (
        <li key={`${i}-${r.specialtyKey}-${r.requestId ?? 'stub'}`}>
          <ReferralChip referral={r} />
        </li>
      ))}
    </ul>
  );
}

interface ChipProps {
  readonly referral: Referral;
}

export function ReferralChip({ referral }: ChipProps) {
  const isStub = referral.status === 'stub';
  const summaryLabel = isStub
    ? `${referral.displayName} — not yet available`
    : `Asked ${referral.displayName}`;
  const titleAttr = referral.classification
    ? `Specialist consultation · ${referral.classification}`
    : 'Specialist consultation';

  return (
    <details
      className={cn(
        'group rounded-chip border bg-surface text-text-primary',
        'transition-[border-color,background-color] duration-300 ease-spring',
        isStub
          ? 'border-caution/30 bg-surface-warm hover:border-caution/50'
          : 'border-border hover:border-border-strong',
      )}
      data-specialty-key={referral.specialtyKey}
      data-status={referral.status}
      {...(referral.requestId ? { 'data-audit-request-id': referral.requestId } : {})}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-2 px-3 py-1.5',
          'font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary',
          'group-hover:text-text-primary',
          'focus-visible:outline-none focus-visible:shadow-ring-focus rounded-chip',
        )}
        title={titleAttr}
      >
        <span aria-hidden>·</span>
        <span>{summaryLabel}</span>
        <span
          aria-hidden
          className={cn(
            'ml-auto text-text-tertiary transition-transform duration-300 ease-spring',
            'group-open:rotate-90',
          )}
        >
          ›
        </span>
      </summary>
      <div className="border-t border-border/60 px-3 py-2 text-body text-text-secondary leading-relaxed">
        {referral.response}
      </div>
    </details>
  );
}
