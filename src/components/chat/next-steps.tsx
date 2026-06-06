'use client';

import type { ValidatedAction } from '@/lib/scribe/tools/propose-next-steps';

const VERB_LABELS: Record<string, string> = {
  measure: 'Measure',
  discuss: 'Discuss',
  track: 'Track',
  behavior: 'Try',
};

const VERB_STYLES: Record<string, string> = {
  measure: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  discuss: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  track: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  behavior: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300',
};

interface Props {
  actions: readonly ValidatedAction[];
}

export function NextSteps({ actions }: Props) {
  if (!actions.length) return null;

  return (
    <div className="mt-5 pt-4 border-t border-border-subtle">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
        Recommended next steps
      </p>
      <ul className="space-y-2">
        {actions.map((action, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${VERB_STYLES[action.verb] ?? 'bg-gray-100 text-gray-700'}`}
            >
              {VERB_LABELS[action.verb] ?? action.verb}
            </span>
            <span className="text-sm leading-relaxed">
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
