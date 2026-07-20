import { Sparkline } from '@/components/demo/sparkline';
import { TrackedLink } from '@/lib/funnel/tracked-link';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';
import { formatValue, getMetricSummary, thinSeries } from '@/lib/demo/persona-summary';
import { SOURCE_NAMES } from '@/lib/marketing/constants';

/**
 * Hero record card — the landing hero's "living record" visual. Floating
 * device chips + connector lines frame a preview of the same synthetic
 * record shown at /demo, so the first thing a visitor sees is the product
 * artifact, not an abstraction (mirrors RecordPreview's approach below the
 * fold, sized and staged for the hero instead).
 */

const ROW_POINTS = 24;

const HERO_ROWS: ReadonlyArray<{ metric: string; source: string }> = [
  { metric: 'hrv_ms', source: 'Wearable' },
  { metric: 'total_sleep_hours', source: 'Wearable' },
  { metric: 'hscrp_mg_l', source: 'Blood panel' },
];

// Labels are typed against the canonical SOURCE_NAMES so a provider rename or
// removal there (already guarded against the live registry by
// record-preview.test.ts) fails this file at typecheck instead of silently
// leaving the hero advertising a stale connector.
const FLOATING_SOURCES: ReadonlyArray<{
  label: (typeof SOURCE_NAMES)[number];
  dot: string;
  style: React.CSSProperties;
  animationDelay: string;
}> = [
  { label: 'Whoop', dot: 'bg-brand-blue-500', style: { top: '4%', left: '0%' }, animationDelay: '0s' },
  { label: 'Oura', dot: 'bg-brand-lavender-500', style: { top: '6%', right: '0%' }, animationDelay: '0.4s' },
  { label: 'Apple Health', dot: 'bg-brand-black', style: { top: '44%', left: '-3%' }, animationDelay: '0.9s' },
  { label: 'Dexcom', dot: 'bg-brand-sage-500', style: { bottom: '6%', left: '1%' }, animationDelay: '0.2s' },
  { label: 'Blood panels (PDF)', dot: 'bg-brand-orange-500', style: { bottom: '6%', right: '0%' }, animationDelay: '0.6s' },
];

export function HeroRecordCard({ className }: { className?: string }) {
  const rows = HERO_ROWS.map(({ metric, source }) => {
    const summary = getMetricSummary(metric);
    if (!summary) return null;
    const { values, inflectionIndex } = thinSeries(summary.values, summary.inflectionIndex, ROW_POINTS);
    return { summary, source, values, inflectionIndex };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return null;

  return (
    <div className={`relative min-h-[420px] sm:min-h-[480px] ${className ?? ''}`}>
      {/* Connector paths — purely decorative, sits behind the chips + card. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full text-brand-blue-500"
        aria-hidden="true"
      >
        <g fill="none" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1.4 3" className="animate-flow">
          <path d="M14,16 C30,28 38,36 50,48" />
          <path d="M86,15 C70,28 62,36 50,48" />
          <path d="M8,50 C24,50 34,50 46,50" />
          <path d="M16,86 C30,72 38,62 50,52" />
          <path d="M87,87 C71,72 62,62 50,52" />
        </g>
      </svg>

      {/* Floating source chips. */}
      {FLOATING_SOURCES.map((s) => (
        <div key={s.label} className="absolute animate-float" style={{ ...s.style, animationDelay: s.animationDelay }}>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip border border-white/70 bg-white/90 px-3 py-1.5 font-mono text-[11px] shadow-hairline backdrop-blur-sm">
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
            {s.label}
          </span>
        </div>
      ))}

      {/* Record card. */}
      <TrackedLink
        href="/demo"
        event={FUNNEL_EVENTS.DEMO_CLICKED}
        eventProperties={{ placement: 'hero_record' }}
        aria-label="Open the live demo record"
        className="group absolute left-1/2 top-1/2 block w-[min(86%,340px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-card bg-surface shadow-modal"
      >
        <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-3 border-b border-border">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
            Your record
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-positive">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-sage-500" aria-hidden="true" />
            Live
          </span>
        </div>

        <div className="px-5 py-1">
          {rows.map(({ summary, source, values, inflectionIndex }, i) => (
            <div key={summary.metric} className={`flex items-center gap-3 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-text-primary">{summary.displayName}</p>
                <Sparkline
                  values={values}
                  inflectionIndex={inflectionIndex}
                  improvement={summary.direction === 'improved' ? summary.improvement : undefined}
                  height={26}
                  ariaLabel={`${summary.displayName} trend`}
                  className="mt-1 w-full"
                />
              </div>
              <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-text-tertiary">
                {formatValue(summary.last, summary.decimals)} {summary.unit}
                <span className="ml-1 text-text-whisper">· {source}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="inline-flex items-center gap-2.5">
            <svg width="30" height="30" viewBox="0 0 44 44" aria-hidden="true">
              <circle cx="22" cy="22" r="18" fill="none" className="stroke-border" strokeWidth="5" />
              <circle
                cx="22"
                cy="22"
                r="18"
                fill="none"
                className="stroke-brand-sage-500"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="80 113"
                transform="rotate(-90 22 22)"
              />
            </svg>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">Recovery</span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-whisper transition-transform duration-450 ease-spring group-hover:translate-x-0.5">
            24 mo →
          </span>
        </div>
      </TrackedLink>
    </div>
  );
}
