'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { MetricBar } from '@/components/ui/metric-bar';
import { SectionLabel } from '@/components/ui/section-label';
import {
  useInsightsData,
  type CheckInHistoryDay,
  type HealthHistoryDay,
} from '@/lib/hooks/use-insights-data';
import { cn } from '@/lib/utils';

const scoreToHeight: Record<string, number> = {
  'poorly': 25, 'scattered': 25, 'crashed': 25,
  'ok': 50, 'variable': 50, 'dipped': 50,
  'well': 75, 'good': 75, 'steady': 75,
  'great': 100, 'locked-in': 100, 'strong': 100,
};

const scoreToColor: Record<string, string> = {
  'poorly': 'bg-border', 'scattered': 'bg-border', 'crashed': 'bg-border',
  'ok': 'bg-text-tertiary', 'variable': 'bg-text-tertiary', 'dipped': 'bg-text-tertiary',
  'well': 'bg-positive', 'good': 'bg-positive', 'steady': 'bg-positive',
  'great': 'bg-accent', 'locked-in': 'bg-accent', 'strong': 'bg-accent',
};

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const METRIC_H3 = 'font-display font-normal text-subheading text-text-primary mb-3 -tracking-[0.01em]';

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${weekEnd}T00:00:00Z`);
  const startStr = start.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endDay = end.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' });
  const year = end.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'UTC' });
  return `${startStr} – ${endDay} · ${year}`;
}

export default function InsightsPage() {
  const router = useRouter();
  const insights = useInsightsData();

  useEffect(() => {
    if (insights.kind === 'unauthenticated') {
      router.push('/sign-in');
    }
  }, [insights.kind, router]);

  if (insights.kind === 'loading' || insights.kind === 'unauthenticated') {
    return (
      <div className="px-5 pt-6 pb-8 grain-page">
        <div className="flex items-center gap-2.5 mb-5">
          <span aria-hidden className="block w-6 h-px bg-text-primary/60" />
          <span className="text-label uppercase text-text-tertiary">Week in review</span>
        </div>
        <p className="mt-6 text-caption text-text-tertiary">Loading your week…</p>
      </div>
    );
  }

  if (insights.kind === 'error') {
    return (
      <div className="px-5 pt-6 pb-8 grain-page">
        <div className="flex items-center gap-2.5 mb-5">
          <span aria-hidden className="block w-6 h-px bg-text-primary/60" />
          <span className="text-label uppercase text-text-tertiary">Week in review</span>
        </div>
        <p className="mt-6 text-caption text-text-tertiary">
          Couldn&rsquo;t load your insights. Pull to refresh or try again in a moment.
        </p>
      </div>
    );
  }

  const { review, checkInHistory, healthHistory } = insights.data;
  const hasAnyCheckIn =
    review.sleepQuality.filled > 0 ||
    review.focusConsistency.filled > 0 ||
    review.protocolAdherence.filled > 0;
  const hasAnyHrv = healthHistory.some((d) => d.hrv !== null);

  return (
    <div className="px-5 pt-6 pb-8 grain-page">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <span aria-hidden className="block w-6 h-px bg-text-primary/60" />
        <span className="text-label uppercase text-text-tertiary">Week in review</span>
      </div>

      <div className="rise">
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em]">
          The <span className="italic text-accent">shape</span> of your week.
        </h1>
        <p className="mt-5 font-mono text-caption uppercase text-text-tertiary tracking-[0.14em]">
          {formatWeekRange(review.weekStart, review.weekEnd)}
        </p>
      </div>

      <div className="mt-12 space-y-8 stagger">
        {/* Metrics */}
        <div>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">01</span>
            <span className="text-label uppercase text-text-tertiary">Sleep quality</span>
          </div>
          <MetricBar {...review.sleepQuality} />
        </div>

        <div className="rule" />

        <div>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">02</span>
            <span className="text-label uppercase text-text-tertiary">Focus consistency</span>
          </div>
          <MetricBar {...review.focusConsistency} />
        </div>

        <div className="rule" />

        <div>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">03</span>
            <span className="text-label uppercase text-text-tertiary">Protocol adherence</span>
          </div>
          <MetricBar {...review.protocolAdherence} />
        </div>

        {!hasAnyCheckIn && (
          <p className="text-caption text-text-tertiary">
            No check-ins yet this week. Complete your morning or evening check-in to start
            building the picture.
          </p>
        )}

        {/* Pattern */}
        {review.patternInsight && (
          <Card variant="contextual" className="mt-2">
            <SectionLabel>Pattern detected</SectionLabel>
            <p className="mt-3 text-body text-text-primary leading-relaxed">
              {review.patternInsight}
            </p>
          </Card>
        )}

        {/* 7-day sleep chart */}
        <div className="rule" />
        <div>
          <h3 className={METRIC_H3}>Sleep quality — 7 days</h3>
          <SleepChart history={checkInHistory} weekStart={review.weekStart} />
        </div>

        {/* HRV from wearable */}
        <div className="rule" />
        <div>
          <h3 className="font-display font-normal text-subheading text-text-primary mb-1 -tracking-[0.01em]">
            HRV — 7 days
          </h3>
          <p className="text-caption text-text-tertiary mb-4">
            {hasAnyHrv ? 'From connected devices' : 'Connect a device to see your HRV trend'}
          </p>
          <HrvChart history={healthHistory} />
        </div>

        {/* Protocol status */}
        <div className="rule" />
        <div>
          <p className="text-body text-text-secondary">
            <span className="font-medium text-text-primary">Protocol status:</span>{' '}
            {review.protocolStatus === 'no-changes'
              ? 'No changes recommended'
              : 'Adjustment recommended'}
          </p>
          <p className="mt-1 font-mono text-caption text-text-tertiary">Next review · in 7 days</p>
        </div>
      </div>
    </div>
  );
}

function SleepChart({
  history,
  weekStart,
}: {
  history: CheckInHistoryDay[];
  weekStart: string;
}) {
  const days: (CheckInHistoryDay | null)[] = Array.from({ length: 7 }, (_, i) => {
    const target = new Date(`${weekStart}T00:00:00Z`);
    target.setUTCDate(target.getUTCDate() + i);
    const key = target.toISOString().slice(0, 10);
    return history.find((d) => d.date === key) ?? null;
  });

  return (
    <div className="flex items-end gap-2 h-24">
      {days.map((day, i) => {
        const val = day?.morning?.sleepQuality ?? null;
        const height = val ? scoreToHeight[val] : 0;
        const color = val ? scoreToColor[val] : 'bg-border/40';
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1.5"
          >
            <div className="w-full flex items-end h-20">
              <div
                className={cn('w-full rounded-t-sm transition-all duration-700 ease-spring', color)}
                style={{ height: val ? `${height}%` : '4%' }}
              />
            </div>
            <span className="font-mono text-[10px] text-text-tertiary uppercase">
              {DAY_LABELS[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HrvChart({ history }: { history: HealthHistoryDay[] }) {
  const maxHrv = Math.max(90, ...history.filter((d) => d.hrv !== null).map((d) => d.hrv as number));
  return (
    <div className="flex items-end gap-2 h-24">
      {history.map((day, i) => {
        const value = day.hrv;
        const height = value === null ? 0 : Math.min(100, (value / maxHrv) * 100);
        return (
          <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="w-full flex items-end h-20">
              <div
                className={cn(
                  'w-full rounded-t-sm transition-all duration-700 ease-spring',
                  value === null ? 'bg-border/40' : 'bg-accent/60',
                )}
                style={{ height: value === null ? '4%' : `${height}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-text-tertiary uppercase">
              {DAY_LABELS[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
