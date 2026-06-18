'use client';

/**
 * Shared source-detail body (plan 2026-06-17-002). The single presentation for
 * "what a source / lab report contains", rendered by BOTH the demo graph's
 * detail sheet and the authed `/record/source/[id]` page — so the two never
 * drift. Body-only: each container supplies its own header (the sheet's header
 * row; the authed page's mesh-gradient banner).
 *
 * Clinician-led order (meaning first): an evidence/authority cue → "what this
 * report established" (the markers it grounds, attention-first, with value/flag
 * where the surface has them) → "from the document" (verbatim excerpts) → a
 * non-diagnostic note. Structured value/flag come from the grounded graph nodes
 * (never re-parsed from text); the excerpt is shown verbatim.
 */

import type { GraphNodeWire } from '@/types/graph';
import type { SourceView } from '@/lib/record/source-view';
import { SectionLabel } from '@/components/ui/section-label';
import { FLAG_PRESENTATION } from '@/lib/markers/flag-presentation';
import { changeDirectionGlyph } from '@/lib/markers/change-presentation';
import { authorityLabel, flagRank } from '@/lib/record/source-detail';
import { cn } from '@/lib/utils';

/**
 * Minimal grounded-marker shape — a structural subset of `GraphNodeWire`, so
 * the demo can pass full wire nodes (rich: value + flag) while the authed page
 * passes name-only rows (graceful — no value/flag) without fabricating a node.
 */
export interface SourceGroundedMarker {
  readonly id: string;
  readonly displayName: string;
  /** Drill-down target (authed navigates by canonicalKey; demo by id). */
  readonly canonicalKey?: string;
  readonly change?: GraphNodeWire['change'];
  readonly interpretation?: GraphNodeWire['interpretation'];
}

interface Props {
  readonly sourceView: SourceView;
  readonly grounded: readonly SourceGroundedMarker[];
  /**
   * When provided, grounded-marker rows become buttons that drill into that
   * marker's own detail. Receives the marker so each surface can pick its
   * navigation key (demo → `id`; authed → `canonicalKey`). Omitted → static rows.
   */
  readonly onSelectNode?: (marker: SourceGroundedMarker) => void;
}

export function SourceDetailBody({ sourceView, grounded, onSelectNode }: Props) {
  const authority = authorityLabel(sourceView.kind);
  const established = [...grounded].sort(
    (a, b) =>
      flagRank(a.interpretation?.flag) - flagRank(b.interpretation?.flag) ||
      a.displayName.localeCompare(b.displayName),
  );

  return (
    <div className="space-y-8">
      {authority && (
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          {authority}
        </p>
      )}

      <section>
        <SectionLabel>What this report established</SectionLabel>
        {established.length === 0 ? (
          <p className="mt-3 text-body text-text-secondary leading-relaxed">
            Nothing has been pulled into the record from this source yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {established.map((m) => (
              <li key={m.id}>
                <GroundedRow marker={m} onSelect={onSelectNode} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionLabel>From the document</SectionLabel>
        {sourceView.chunks.length === 0 ? (
          <p className="mt-3 text-body text-text-secondary leading-relaxed">
            This source has no extractable text.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {sourceView.chunks.map((chunk) => (
              <li key={chunk.id} className="rounded-card border border-border bg-surface p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                    {sourceView.kindLabel}
                    {chunk.pageNumber !== null
                      ? ` · p.${chunk.pageNumber}`
                      : ` · #${String(chunk.index + 1).padStart(2, '0')}`}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-body text-text-secondary leading-relaxed">
                  {chunk.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-caption text-text-tertiary leading-relaxed">
        Shown as captured from the source — for tracking and discussion with a clinician, not a
        diagnosis.
      </p>
    </div>
  );
}

function GroundedRow({
  marker,
  onSelect,
}: {
  marker: SourceGroundedMarker;
  onSelect?: (marker: SourceGroundedMarker) => void;
}) {
  const change = marker.change;
  const flag = marker.interpretation?.flag;
  const arrow = change?.direction ? changeDirectionGlyph(change.direction) : '';

  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-text-primary">{marker.displayName}</span>
        {change && (
          <span className="mt-0.5 block font-mono text-caption text-text-secondary">
            {change.beforeValue != null ? `${change.beforeValue} ${arrow} ` : ''}
            {change.afterValue}
            {change.unit ? ` ${change.unit}` : ''}
          </span>
        )}
      </span>
      {flag && (
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
            FLAG_PRESENTATION[flag].chipClass,
          )}
        >
          {FLAG_PRESENTATION[flag].label}
        </span>
      )}
    </>
  );

  const base =
    'flex w-full items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left';

  if (!onSelect) return <div className={base}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={() => onSelect(marker)}
      aria-label={`Open ${marker.displayName}`}
      className={cn(
        base,
        'transition-colors duration-300 ease-spring hover:border-border-hover hover:bg-surface-warm',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
      )}
    >
      {inner}
    </button>
  );
}
