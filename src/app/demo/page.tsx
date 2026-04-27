import Link from 'next/link';
import { Sparkline } from '@/components/demo/sparkline';
import {
  formatValue,
  getMetricSummary,
  PERSONA_INFLECTION_MONTH,
  type PersonaMetricSummary,
} from '@/lib/demo/persona-summary';

/**
 * `/demo` — public overview of the metabolic-syndrome persona's
 * 24-month synthetic arc. Server-rendered from the fixture; no DB.
 *
 * Story spine: pick four metrics that reverse direction at month 14 and
 * tell a clean before/after read. Charts are tiny, the copy carries the
 * meaning. Visitors can drill into the record (graph) or open chat.
 */

export const dynamic = 'force-static';
export const runtime = 'nodejs';

const HEADLINE_METRICS: ReadonlyArray<{
  metric: string;
  blurb: string;
}> = [
  {
    metric: 'hba1c_percent',
    blurb:
      'Glycaemic control crept up to prediabetic range, then walked back down once the protocol started.',
  },
  {
    metric: 'systolic_bp_mmhg_morning',
    blurb:
      'Morning systolic BP drifted into Stage-1 hypertension and reverted toward range after intervention.',
  },
  {
    metric: 'sleep_efficiency_pct',
    blurb:
      'Sleep efficiency lifted ~4 percentage points — the kind of swing that compounds across HRV and mood.',
  },
  {
    metric: 'free_testosterone_pg_ml',
    blurb:
      'Free testosterone climbed out of the low-normal band as body composition and sleep improved.',
  },
];

export default function DemoOverviewPage() {
  const summaries = HEADLINE_METRICS.map(({ metric, blurb }) => {
    const summary = getMetricSummary(metric);
    return summary ? { summary, blurb } : null;
  }).filter((x): x is { summary: PersonaMetricSummary; blurb: string } => x !== null);

  return (
    <div className="pt-8 pb-12">
      {/* Hero */}
      <div className="rise">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">
          The persona — 38 yo, mild metabolic syndrome
        </p>
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em]">
          24 months.{' '}
          <span className="italic">One</span> change.
          <br />
          <span className="text-text-secondary">Tracked across labs, sleep, hormones.</span>
        </h1>
        <p className="mt-6 max-w-xl text-body-lg text-text-secondary leading-relaxed">
          A synthetic record across 18 metrics, anchored to today. Month 14 is the
          inflection — a lifestyle intervention lands and the trends bend. Below, the
          four headlines that tell the arc.
        </p>
      </div>

      {/* Headline metrics */}
      <section className="mt-12 grid gap-10 sm:grid-cols-2">
        {summaries.map(({ summary, blurb }) => (
          <MetricCard key={summary.metric} summary={summary} blurb={blurb} />
        ))}
      </section>

      <div className="rule mt-14" />

      {/* Footnotes & onward links */}
      <section className="mt-10 flex flex-col gap-5">
        <p className="text-caption text-text-tertiary">
          Inflection at month {PERSONA_INFLECTION_MONTH}. Sparklines show the
          downsampled series; values are first/last across the full 24-month window.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/demo/record"
            className="rounded-chip border border-border bg-surface px-4 py-2 text-caption text-text-secondary hover:border-border-strong hover:text-text-primary transition-[color,border-color] duration-300 ease-spring"
          >
            Open the record →
          </Link>
          <Link
            href="/demo/ask"
            className="rounded-chip border border-border bg-surface px-4 py-2 text-caption text-text-secondary hover:border-border-strong hover:text-text-primary transition-[color,border-color] duration-300 ease-spring"
          >
            Ask the assistant →
          </Link>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ summary, blurb }: { summary: PersonaMetricSummary; blurb: string }) {
  // Arrow follows the *physical* direction of the line. `improvement`
  // encodes which way is good for this metric; `direction` encodes
  // whether the persona moved that way. So the arrow comes from
  // `improvement` for "improved" cards, and the inverse for "worsened".
  const movedUp =
    summary.direction === 'improved'
      ? summary.improvement === 'up'
      : summary.improvement === 'down';
  const arrow = movedUp ? '↗' : '↘';
  const directionLabel = summary.direction === 'improved' ? 'Improved' : 'Worsened';
  return (
    <article className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
          {summary.displayName}
        </h2>
        <span
          className={
            summary.direction === 'improved'
              ? 'font-mono text-[10px] uppercase tracking-[0.14em] text-positive'
              : 'font-mono text-[10px] uppercase tracking-[0.14em] text-caution'
          }
        >
          {arrow} {directionLabel}
        </span>
      </div>

      <Sparkline
        values={summary.values}
        inflectionIndex={summary.inflectionIndex}
        improvement={summary.improvement}
        ariaLabel={`${summary.displayName} 24 month sparkline`}
        className="mt-4"
      />

      <div className="mt-3 flex items-baseline gap-4 font-mono text-caption text-text-tertiary">
        <span>
          Start{' '}
          <span className="text-text-primary">
            {formatValue(summary.first, summary.decimals)}
          </span>{' '}
          {summary.unit}
        </span>
        <span aria-hidden>·</span>
        <span>
          Now{' '}
          <span className="text-text-primary">
            {formatValue(summary.last, summary.decimals)}
          </span>{' '}
          {summary.unit}
        </span>
      </div>

      <p className="mt-3 text-body text-text-secondary leading-relaxed">{blurb}</p>
    </article>
  );
}
