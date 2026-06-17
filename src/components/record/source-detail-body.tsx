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

import type { GraphNodeWire, FlagTier } from '@/types/graph';
import type { SourceView } from '@/lib/record/source-view';
import { SectionLabel } from '@/components/ui/section-label';
import { FLAG_PRESENTATION } from '@/lib/markers/flag-presentation';
import { changeDirectionGlyph } from '@/lib/markers/change-presentation';
import { cn } from '@/lib/utils';

/**
 * Minimal grounded-marker shape — a structural subset of `GraphNodeWire`, so
 * the demo can pass full wire nodes (rich: value + flag) while the authed page
 * passes name-only rows (graceful — no value/flag) without fabricating a node.
 */
export interface SourceGroundedMarker {
  readonly id: string;
  readonly displayName: string;
  readonly change?: GraphNodeWire['change'];
  readonly interpretation?: GraphNodeWire['interpretation'];
}

// Source kind → trust calibration. A verified lab reads differently from a
// clinician note, a wearable estimate, or a self-report — the clinician's first
// question. Self-contained + safe for every SourceDocumentKind (unknown → no
// cue), so the shared body never couples to the demo-only evidence-grade util.
function authorityLabel(kind: string): string {
  switch (kind) {
    case 'lab_pdf':
    case 'private_lab_panel':
    case 'longevity_panel':
    case 'pathology_report':
      return 'Verified lab result';
    case 'genetics_report':
    case 'microbiome_panel':
    case 'stool_panel':
      return 'Lab panel';
    case 'at_home_test_result':
      return 'At-home test';
    case 'gp_record':
    case 'gp_letter':
    case 'specialist_letter':
    case 'referral_letter':
    case 'discharge_summary':
      return 'Clinician record';
    case 'imaging_report':
      return 'Imaging report';
    case 'body_composition_scan':
    case 'dexa_scan':
      return 'Body scan';
    case 'wearable_window':
      return 'Wearable estimate';
    case 'intake_text':
    case 'checkin':
      return 'Self-reported';
    default:
      return '';
  }
}

// Attention-first ordering — the clinically-salient readings surface first.
// Never alarming, just ordered; markers with no flag sort last.
const FLAG_PRIORITY: Record<FlagTier, number> = {
  escalation: 0,
  clinician_discussion: 1,
  attention: 2,
};
function flagRank(m: SourceGroundedMarker): number {
  const f = m.interpretation?.flag;
  return f ? FLAG_PRIORITY[f] : 3;
}

interface Props {
  readonly sourceView: SourceView;
  readonly grounded: readonly SourceGroundedMarker[];
  /**
   * When provided, grounded-marker rows become buttons that drill into that
   * node's own detail (the demo passes its URL updater). Omitted → static rows.
   */
  readonly onSelectNode?: (id: string) => void;
}

export function SourceDetailBody({ sourceView, grounded, onSelectNode }: Props) {
  const authority = authorityLabel(sourceView.kind);
  const established = [...grounded].sort(
    (a, b) => flagRank(a) - flagRank(b) || a.displayName.localeCompare(b.displayName),
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
                    {chunk.pageNumber !== null ? ` · p.${chunk.pageNumber}` : ''}
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
  onSelect?: (id: string) => void;
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
      onClick={() => onSelect(marker.id)}
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
