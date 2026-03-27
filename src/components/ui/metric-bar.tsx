'use client';

import { cn } from '@/lib/utils';

interface MetricBarProps {
  filled: number;
  total: number;
  trend: 'improving' | 'stable' | 'declining';
  label: string;
}

const trendArrow = {
  improving: '↑',
  stable: '→',
  declining: '↓',
};

const trendColor = {
  improving: 'text-positive',
  stable: 'text-text-tertiary',
  declining: 'text-caution',
};

function MetricBar({ filled, total, trend, label }: MetricBarProps) {
  return (
    <div>
      <div className="flex gap-1.5 mb-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-2 flex-1 rounded-sm transition-colors',
              i < filled ? 'bg-accent' : 'bg-border'
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-caption text-text-secondary">{label}</span>
        <span className={cn('text-caption font-medium', trendColor[trend])}>
          {trend.charAt(0).toUpperCase() + trend.slice(1)} {trendArrow[trend]}
        </span>
      </div>
    </div>
  );
}

export { MetricBar };
