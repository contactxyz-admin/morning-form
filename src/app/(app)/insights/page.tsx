'use client';

import { Card } from '@/components/ui/card';
import { MetricBar } from '@/components/ui/metric-bar';
import { SectionLabel } from '@/components/ui/section-label';
import { mockWeeklyReview, mockCheckInHistory, mockHealthHistory } from '@/lib/mock-data';
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

const METRIC_H3 = 'font-display font-normal text-subheading text-text-primary mb-3 -tracking-[0.01em]';

export default function InsightsPage() {
  const review = mockWeeklyReview;
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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
          March 20 – 26 · 2026
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

        {/* Pattern */}
        {review.patternInsight && (
          <Card variant="contextual" className="mt-2">
            <SectionLabel>Pattern detected</SectionLabel>
            <p className="mt-3 text-body text-text-primary leading-relaxed">{review.patternInsight}</p>
          </Card>
        )}

        {/* 7-day sleep chart */}
        <div className="rule" />
        <div>
          <h3 className={METRIC_H3}>Sleep quality — 7 days</h3>
          <div className="flex items-end gap-2 h-24">
            {mockCheckInHistory.map((day, i) => {
              const val = day.morning?.sleepQuality || 'ok';
              const height = scoreToHeight[val] || 50;
              const color = scoreToColor[val] || 'bg-text-tertiary';
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end h-20">
                    <div
                      className={cn('w-full rounded-t-sm transition-all duration-700 ease-spring', color)}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-text-tertiary uppercase">{days[i]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* HRV from wearable */}
        <div className="rule" />
        <div>
          <h3 className="font-display font-normal text-subheading text-text-primary mb-1 -tracking-[0.01em]">
            HRV — 7 days
          </h3>
          <p className="text-caption text-text-tertiary mb-4">From connected devices</p>
          <div className="flex items-end gap-2 h-24">
            {mockHealthHistory.map((day, i) => {
              const maxHrv = 90;
              const height = Math.min(100, (day.hrv / maxHrv) * 100);
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end h-20">
                    <div
                      className="w-full rounded-t-sm bg-accent/60 transition-all duration-700 ease-spring"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-text-tertiary uppercase">{days[i]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Protocol status */}
        <div className="rule" />
        <div>
          <p className="text-body text-text-secondary">
            <span className="font-medium text-text-primary">Protocol status:</span> No changes recommended
          </p>
          <p className="mt-1 font-mono text-caption text-text-tertiary">Next review · in 7 days</p>
        </div>
      </div>
    </div>
  );
}
