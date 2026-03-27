'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

const timeline = [
  {
    period: 'Week 1–2',
    description: 'Adjustment period. You may notice subtle shifts in sleep onset and morning clarity. Don\'t over-index on daily variation.',
  },
  {
    period: 'Week 3–4',
    description: 'Patterns should stabilize. Focus duration and sleep quality are the first reliable signals.',
  },
  {
    period: 'Week 5+',
    description: 'This is where feedback loops matter. Your check-ins will shape protocol refinement.',
  },
];

const disclaimers = [
  'It does not replace sleep hygiene fundamentals',
  'It does not treat clinical anxiety or insomnia',
  'It is not a stimulant — you won\'t feel a "hit"',
];

export default function ExpectationsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg px-5 pt-12 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg mx-auto"
      >
        <h2 className="text-heading font-medium text-text-primary">What to expect</h2>

        <div className="mt-10 space-y-8">
          {timeline.map((item) => (
            <div key={item.period}>
              <span className="font-mono text-data text-accent">{item.period}</span>
              <p className="mt-2 text-body text-text-secondary leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <h3 className="text-subheading font-medium text-text-primary mb-4">
            What this protocol does NOT do
          </h3>
          <ul className="space-y-2.5">
            {disclaimers.map((d) => (
              <li key={d} className="text-body text-text-secondary flex gap-2">
                <span className="text-text-tertiary shrink-0">·</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-bg via-bg to-transparent pt-12">
        <Button fullWidth onClick={() => router.push('/reveal/begin')}>
          Continue →
        </Button>
      </div>
    </div>
  );
}
