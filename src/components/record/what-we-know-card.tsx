import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import type { GraphSummary } from '@/lib/record/types';

interface WhatWeKnowCardProps {
  summary: GraphSummary;
}

interface StatProps {
  value: number;
  label: string;
}

function Stat({ value, label }: StatProps) {
  return (
    <div>
      <p className="font-display font-light text-display-sm text-text-primary -tracking-[0.03em]">
        {value}
      </p>
      <p className="mt-1 text-caption text-text-tertiary">{label}</p>
    </div>
  );
}

function WhatWeKnowCard({ summary }: WhatWeKnowCardProps) {
  return (
    <Card variant="paper" className="space-y-6">
      <SectionLabel className="text-text-whisper">What we know</SectionLabel>
      <div className="grid grid-cols-3 gap-4">
        <Stat value={summary.sourceCount} label={summary.sourceCount === 1 ? 'source' : 'sources'} />
        <Stat value={summary.nodeCount} label={summary.nodeCount === 1 ? 'node' : 'nodes'} />
        <Stat value={summary.topicCount} label={summary.topicCount === 1 ? 'topic' : 'topics'} />
      </div>
    </Card>
  );
}

export { WhatWeKnowCard };
