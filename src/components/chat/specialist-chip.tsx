'use client';

/**
 * "Asked <displayName>" pill shown above assistant bubbles. Clicking
 * routes to the topic page for a drill-down read. The label falls back
 * to the topicKey itself if we don't have a human label registered,
 * which future-proofs against new specialists landing before a UI
 * update.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils';

const SPECIALIST_LABELS: Record<string, string> = {
  iron: 'Iron specialist',
  'sleep-recovery': 'Sleep & recovery specialist',
  'energy-fatigue': 'Energy & fatigue specialist',
};

export function specialistLabel(topicKey: string): string {
  return SPECIALIST_LABELS[topicKey] ?? `${topicKey} specialist`;
}

interface Props {
  topicKey: string;
  className?: string;
}

export function SpecialistChip({ topicKey, className }: Props) {
  return (
    <Link
      href={`/topics/${topicKey}`}
      className={cn(
        'inline-flex items-center gap-1.5',
        'rounded-chip border border-border bg-surface px-2.5 py-1',
        'font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary',
        'transition-[color,border-color] duration-300 ease-spring',
        'hover:text-text-primary hover:border-border-strong',
        'focus-visible:outline-none focus-visible:shadow-ring-focus',
        className,
      )}
    >
      <span aria-hidden>·</span>
      <span>Asked {specialistLabel(topicKey)}</span>
    </Link>
  );
}
