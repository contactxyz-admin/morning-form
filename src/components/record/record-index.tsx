import { SectionLabel } from '@/components/ui/section-label';
import { ActivityFeed } from './activity-feed';
import { TopicCard } from './topic-card';
import { WhatWeKnowCard } from './what-we-know-card';
import type { RecordIndex as RecordIndexData } from '@/lib/record/types';

interface RecordIndexProps {
  data: RecordIndexData;
}

function RecordIndex({ data }: RecordIndexProps) {
  const { topics, recentActivity, graphSummary } = data;

  return (
    <div className="space-y-14">
      <header className="rise">
        <SectionLabel className="text-text-whisper">Your record</SectionLabel>
        <h1 className="mt-4 font-display font-light text-display-xl sm:text-display-2xl text-text-primary -tracking-[0.045em] leading-[0.98]">
          The living <span className="italic text-accent">index</span> of
          everything we&rsquo;ve gathered.
        </h1>
        <p className="mt-4 text-body-lg text-text-secondary max-w-xl leading-relaxed">
          A catalog of your topics, the sources behind them, and what the graph
          has learned so far.
        </p>
      </header>

      <div className="stagger space-y-14">
        <WhatWeKnowCard summary={graphSummary} />

        <section>
          <SectionLabel className="text-text-whisper">Topics</SectionLabel>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {topics.map((topic) => (
              <TopicCard key={topic.topicKey} topic={topic} />
            ))}
          </div>
        </section>

        <section>
          <ActivityFeed entries={recentActivity} />
        </section>
      </div>
    </div>
  );
}

export { RecordIndex };
