'use client';

/**
 * Shared category-filter legend for the force-directed graph (plan
 * 2026-06-17-001 + Addendum). The 4-swatch legend doubles as a multi-select
 * filter: all classes on by default; switch any off to fade that visual class
 * to the canvas ghost floor and focus on the rest.
 *
 * One component for BOTH the public demo (`/demo/record`) and the authed graph
 * (`/record?mode=map`), so the two never drift. Swatch fill/stroke come from
 * `LEGEND_ITEMS` (single source, safelisted in tailwind.config.ts). `aria-pressed`
 * carries the on/off state non-visually; the focus ring is the opaque
 * `outline-button-focus` (clears the 3:1 contrast floor).
 */

import { useCallback, useState } from 'react';
import {
  LEGEND_ITEMS,
  toggleHiddenClass,
  visualForNode,
  type NodeVisualClass,
} from '@/lib/graph/visual-encoding';
import type { GraphNodeWire } from '@/types/graph';

/**
 * Category-filter state + the canvas `nodeGhosted` predicate, shared by every
 * surface that renders the graph. Keeps the state, the immutable toggle, and the
 * (memoised) predicate in one place so the demo and the authed graph can't drift.
 */
export function useCategoryFilter() {
  const [hiddenClasses, setHiddenClasses] = useState<ReadonlySet<NodeVisualClass>>(
    () => new Set(),
  );
  const toggle = useCallback((visualClass: NodeVisualClass) => {
    setHiddenClasses((prev) => toggleHiddenClass(prev, visualClass));
  }, []);
  // Clear all hidden classes (the "Show all" affordance). No-op when already
  // empty so it can't churn `hiddenClasses` identity / re-run the dim effect.
  const reset = useCallback(() => setHiddenClasses((prev) => (prev.size === 0 ? prev : new Set())), []);
  // Stable per filter set — its identity changes only when the filter changes,
  // which re-runs the canvas dim effect to fade/restore the toggled class.
  const nodeGhosted = useCallback(
    (node: GraphNodeWire) => hiddenClasses.has(visualForNode(node.type).visualClass),
    [hiddenClasses],
  );
  return { hiddenClasses, toggle, reset, nodeGhosted };
}

export function GraphFilterLegend({
  hiddenClasses,
  onToggle,
  onReset,
  className,
}: {
  hiddenClasses: ReadonlySet<NodeVisualClass>;
  onToggle: (visualClass: NodeVisualClass) => void;
  /** When provided, a "Show all" chip appears while any class is hidden. */
  onReset?: () => void;
  /** Extra classes on the <ul> (e.g. spacing per surface). */
  className?: string;
}) {
  const anyHidden = hiddenClasses.size > 0;
  return (
    <ul
      aria-label="Filter the graph by node type"
      className={`flex flex-wrap items-center gap-x-2 gap-y-2 ${className ?? ''}`}
    >
      {LEGEND_ITEMS.map((item) => {
        const shown = !hiddenClasses.has(item.visualClass);
        return (
          <li key={item.visualClass}>
            <button
              type="button"
              aria-pressed={shown}
              onClick={() => onToggle(item.visualClass)}
              title={shown ? `Hide ${item.label}` : `Show ${item.label}`}
              className={`flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-button-focus ${
                shown
                  ? 'border-border text-text-tertiary hover:bg-surface-warm'
                  : 'border-transparent text-text-tertiary/40 line-through'
              }`}
            >
              <svg aria-hidden viewBox="0 0 12 12" width={12} height={12} className="shrink-0">
                <circle
                  cx={6}
                  cy={6}
                  r={5}
                  className={shown ? `${item.fillClass} ${item.strokeClass}` : 'fill-none stroke-text-tertiary/40'}
                  strokeWidth={1.2}
                />
              </svg>
              <span>{item.label}</span>
            </button>
          </li>
        );
      })}
      {onReset && anyHidden && (
        <li>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary underline decoration-dotted underline-offset-2 transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-button-focus"
          >
            Show all
          </button>
        </li>
      )}
    </ul>
  );
}
