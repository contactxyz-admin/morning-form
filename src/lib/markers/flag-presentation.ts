/**
 * Flag tier → calm, plain-English presentation (CMO direction 2026-06-16,
 * plan 2026-06-16-003). The three tiers are kept visually DISTINCT and never
 * blurred; the copy is never alarming. Single-sourced so the detail-sheet card
 * and the priority-cluster summary can't drift. Chip classes are safelisted in
 * tailwind.config.ts.
 */

import type { FlagTier } from '@/types/graph';

export const FLAG_PRESENTATION: Record<FlagTier, { label: string; chipClass: string }> = {
  attention: { label: 'Worth watching', chipClass: 'bg-surface text-text-secondary' },
  clinician_discussion: {
    label: 'Worth discussing with a GP',
    chipClass: 'bg-caution/12 text-caution',
  },
  escalation: { label: 'Needs clinical review', chipClass: 'bg-alert/12 text-alert' },
};
