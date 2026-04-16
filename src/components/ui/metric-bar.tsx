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
      <div className="flex gap-[3px] mb-3">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-[6px] flex-1 rounded-full transition-[background-color] duration-450 ease-spring',
              i < filled ? 'bg-accent' : 'bg-border',
            )}
            style={{ transitionDelay: `${i * 30}ms` }}
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
