'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/section-label';

const timeline = [
  {
    period: 'Week 1–2',
    description:
      'Adjustment period. You may notice subtle shifts in sleep onset and morning clarity. Don\u2019t over-index on daily variation.',
  },
  {
    period: 'Week 3–4',
    description:
      'Patterns should stabilise. Focus duration and sleep quality are the first reliable signals.',
  },
  {
    period: 'Week 5+',
    description:
      'This is where feedback loops matter. Your check-ins will shape protocol refinement.',
  },
];

const disclaimers = [
  'It does not replace sleep hygiene fundamentals',
  'It does not treat clinical anxiety or insomnia',
  'It is not a stimulant \u2014 you won\u2019t feel a \u201chit\u201d',
];

export default function ExpectationsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
        className="max-w-xl mx-auto"
      >
        <SectionLabel>Expectations</SectionLabel>
        <h2 className="mt-4 font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
          What to <span className="italic font-light">expect</span>.
        </h2>

        <div className="mt-12 space-y-10">
          {timeline.map((item) => (
            <div key={item.period}>
              <span className="font-mono text-caption text-accent">{item.period}</span>
              <p className="mt-2 text-body-lg text-text-secondary leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-border pt-10">
          <SectionLabel>What this protocol does NOT do</SectionLabel>
          <ul className="mt-5 space-y-2.5">
            {disclaimers.map((d, i) => (
              <li key={i} className="text-body-lg text-text-secondary flex gap-3">
                <span className="text-text-tertiary shrink-0 mt-[0.55rem] h-px w-3 bg-text-tertiary" />
                <span dangerouslySetInnerHTML={{ __html: d }} />
              </li>
            ))}
          </ul>
        </div>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 px-5 sm:px-8 pb-6 pt-12 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <div className="max-w-xl mx-auto">
          <Button fullWidth size="lg" onClick={() => router.push('/reveal/begin')}>
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
