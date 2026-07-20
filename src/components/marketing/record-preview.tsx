import { Sparkline } from '@/components/demo/sparkline';
import { TrackedLink } from '@/lib/funnel/tracked-link';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';
import {
  arrowFor,
  formatValue,
  getMetricSummary,
  thinSeries,
  type PersonaMetricSummary,
} from '@/lib/demo/persona-summary';
import { PREVIEW_METRICS } from './record-preview-metrics';

/**
 * RecordPreview — the landing hero's product shot.
 *
 * Renders four rows of the public demo persona's real synthetic series
 * (same fixture as /demo) so the first thing a visitor sees is the
 * product artifact itself: markers from different sources, trending on
 * one record. Server-renderable, no DB — identical data path to /demo.
 *
 * Metric choice: the four series whose first→last values read cleanly
 * in the direction of improvement (others, like HbA1c, improve against
 * the pre-inflection peak but look flat start-to-now, which would
 * confuse a five-second scan).
 */

/** The 90-point demo series reads as noise at the preview's 34px row
 *  height; resample to 31 points so the trend, not the jitter, carries.
 *  Uses the data layer's downsample (uniform spacing, both endpoints
 *  kept) and the same proportional inflection remap persona-summary
 *  applies, so the dashed rule stays on the true timeline. */
const PREVIEW_POINTS = 31;

function thinForPreview(summary: PersonaMetricSummary): {
  values: readonly number[];
  inflectionIndex: number;
} {
  return thinSeries(summary.values, summary.inflectionIndex, PREVIEW_POINTS);
}

export function RecordPreview({ className }: { className?: string }) {
  const rows = PREVIEW_METRICS.map(({ metric, source }) => {
    const summary = getMetricSummary(metric);
    return summary ? { summary, source } : null;
  }).filter((r): r is { summary: PersonaMetricSummary; source: string } => r !== null);

  if (rows.length === 0) return null;

  return (
    <TrackedLink
      href="/demo"
      event={FUNNEL_EVENTS.DEMO_CLICKED}
      eventProperties={{ placement: 'record_preview' }}
      aria-label="Open the live demo record"
      className={`group block rounded-card border border-border bg-surface shadow-hairline transition-[border-color,box-shadow] duration-450 ease-spring hover:border-border-strong hover:shadow-card-hover ${className ?? ''}`}
    >
      <div className="flex items-baseline justify-between gap-4 px-6 pt-5 pb-4 border-b border-border">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
          The record · live demo
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-whisper">
          24 months
        </span>
      </div>

      <div className="px-6 py-2 bg-record-grid">
        {rows.map(({ summary, source }, i) => (
          <div
            key={summary.metric}
            className={`py-4 ${i > 0 ? 'border-t border-border' : ''}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-caption font-medium text-text-primary">
                {summary.displayName}
                <span className="ml-2 font-normal text-text-whisper">{source}</span>
              </p>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                  summary.direction === 'improved' ? 'text-positive-deep' : 'text-caution'
                }`}
              >
                {arrowFor(summary)} {summary.direction === 'improved' ? 'Improved' : 'Worsened'}
              </span>
            </div>
            <div className="mt-2 flex items-end gap-4">
              <Sparkline
                {...thinForPreview(summary)}
                // Sparkline colours the post-inflection stroke positive
                // whenever `improvement` is supplied; only supply it when
                // the series actually improved, so a worsened series can
                // never pair a green stroke with the caution chip above.
                improvement={summary.direction === 'improved' ? summary.improvement : undefined}
                height={34}
                ariaLabel={`${summary.displayName} 24 month trend`}
                className="flex-1 min-w-0"
              />
              <p className="shrink-0 font-mono text-[11px] text-text-tertiary whitespace-nowrap">
                {formatValue(summary.first, summary.decimals)} →{' '}
                <span className="text-text-primary">
                  {formatValue(summary.last, summary.decimals)}
                </span>{' '}
                {summary.unit}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-border">
        <span className="text-caption text-text-tertiary">
          A synthetic member, anchored to today.
        </span>
        <span className="text-caption font-medium text-text-primary transition-transform duration-450 ease-spring group-hover:translate-x-0.5">
          Open the demo →
        </span>
      </div>
    </TrackedLink>
  );
}
