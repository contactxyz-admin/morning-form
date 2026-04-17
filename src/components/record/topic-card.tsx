'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { MeshGradient } from '@/components/ui/mesh-gradient';
import type { TopicStatus } from '@/lib/record/types';

interface TopicCardProps {
  topic: TopicStatus;
}

function statusCopy(s: TopicStatus): { label: string; tone: 'stub' | 'full' | 'error' } {
  if (s.status === 'full') return { label: 'Compiled', tone: 'full' };
  if (s.status === 'error') return { label: 'Needs attention', tone: 'error' };
  if (s.hasEvidence) return { label: 'Ready to compile', tone: 'stub' };
  return { label: 'Awaiting sources', tone: 'stub' };
}

function TopicCard({ topic }: TopicCardProps) {
  const { label, tone } = statusCopy(topic);
  const updatedLabel = topic.updatedAt
    ? new Date(topic.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';

  return (
    <Link
      href={`/topics/${encodeURIComponent(topic.topicKey)}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-button-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-card"
      aria-label={`${topic.displayName} — ${label}`}
    >
      <Card clickable className="flex items-start gap-4">
        <MeshGradient
          seed={topic.topicKey}
          variant="topic"
          className="h-14 w-14 shrink-0 rounded-card-sm border border-border/60"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display font-light text-subheading text-text-primary -tracking-[0.015em] truncate">
              {topic.displayName}
            </h3>
            <SectionLabel
              className={
                tone === 'full'
                  ? 'text-positive'
                  : tone === 'error'
                    ? 'text-alert'
                    : 'text-text-whisper'
              }
            >
              {label}
            </SectionLabel>
          </div>
          <p className="mt-2 text-caption text-text-tertiary">
            {topic.sourceCount} source{topic.sourceCount === 1 ? '' : 's'} ·{' '}
            {topic.nodeCount} node{topic.nodeCount === 1 ? '' : 's'} · {updatedLabel}
          </p>
        </div>
      </Card>
    </Link>
  );
}

export { TopicCard };
