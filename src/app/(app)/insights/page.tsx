'use client';

import { motion } from 'framer-motion';
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

export default function InsightsPage() {
  const review = mockWeeklyReview;
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="px-5 pt-6 pb-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <SectionLabel>WEEK IN REVIEW</SectionLabel>
        <p className="mt-1 text-caption text-text-tertiary">March 20 – 26, 2026</p>
      </motion.div>

      <div className="mt-8 space-y-6">
        {/* Metrics */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h3 className="text-body font-medium text-text-primary mb-3">Sleep quality</h3>
          <MetricBar {...review.sleepQuality} />
        </motion.div>

        <div className="border-t border-border" />

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h3 className="text-body font-medium text-text-primary mb-3">Focus consistency</h3>
          <MetricBar {...review.focusConsistency} />
        </motion.div>

        <div className="border-t border-border" />

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h3 className="text-body font-medium text-text-primary mb-3">Protocol adherence</h3>
          <MetricBar {...review.protocolAdherence} />
        </motion.div>

        {/* Pattern */}
        {review.patternInsight && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card variant="contextual" className="mt-2">
              <SectionLabel>PATTERN DETECTED</SectionLabel>
              <p className="mt-3 text-body text-text-primary leading-relaxed">{review.patternInsight}</p>
            </Card>
          </motion.div>
        )}

        {/* 7-day sleep chart */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="border-t border-border pt-6">
            <h3 className="text-body font-medium text-text-primary mb-4">Sleep quality — 7 days</h3>
            <div className="flex items-end gap-2 h-24">
              {mockCheckInHistory.map((day, i) => {
                const val = day.morning?.sleepQuality || 'ok';
                const height = scoreToHeight[val] || 50;
                const color = scoreToColor[val] || 'bg-text-tertiary';
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end h-20">
                      <div
                        className={cn('w-full rounded-t-sm transition-all', color)}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-text-tertiary">{days[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* HRV from wearable */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <div className="border-t border-border pt-6">
            <h3 className="text-body font-medium text-text-primary mb-1">HRV — 7 days</h3>
            <p className="text-caption text-text-tertiary mb-4">From connected devices</p>
            <div className="flex items-end gap-2 h-24">
              {mockHealthHistory.map((day, i) => {
                const maxHrv = 90;
                const height = Math.min(100, (day.hrv / maxHrv) * 100);
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end h-20">
                      <div
                        className="w-full rounded-t-sm bg-accent/60"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-text-tertiary">{days[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Protocol status */}
        <div className="border-t border-border pt-6">
          <p className="text-body text-text-secondary">
            <span className="font-medium text-text-primary">Protocol status:</span> No changes recommended
          </p>
          <p className="mt-1 text-caption text-text-tertiary">Next review: in 7 days</p>
        </div>
      </div>
    </div>
  );
}
