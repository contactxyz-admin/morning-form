'use client';

import type { ValidatedAction } from '@/lib/scribe/tools/propose-next-steps';
import { Badge } from '@/components/ui/badge';

const VERB_LABELS: Record<string, string> = {
  measure: 'Measure',
  discuss: 'Discuss',
  track: 'Track',
  behavior: 'Try',
};

// One brand hue per action category — a visual taxonomy, not a severity
// signal, so these draw from the brand ramp rather than the
// positive/caution/alert status tokens.
const VERB_STYLES: Record<string, string> = {
  measure: 'bg-brand-blue-100 text-brand-blue-900',
  discuss: 'bg-brand-lavender-100 text-brand-lavender-900',
  track: 'bg-brand-sage-100 text-brand-sage-900',
  behavior: 'bg-brand-orange-100 text-brand-orange-900',
};

interface Props {
  actions: readonly ValidatedAction[];
}

export function NextSteps({ actions }: Props) {
  if (!actions.length) return null;

  return (
    <div className="mt-5 pt-4 border-t border-border">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
        Recommended next steps
      </p>
      <ul className="space-y-2">
        {actions.map((action, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <Badge
              className={`shrink-0 px-2 py-0.5 text-[10px] tracking-wide ${VERB_STYLES[action.verb] ?? 'bg-bg-deep text-text-secondary'}`}
            >
              {VERB_LABELS[action.verb] ?? action.verb}
            </Badge>
            <span className="text-caption leading-relaxed">
              {action.label}
              {action.markerName && (
                <span className="ml-1 font-mono text-[11px] text-text-tertiary">
                  ({action.markerName})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
