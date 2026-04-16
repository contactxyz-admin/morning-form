'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';

export default function RationalePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
        className="max-w-xl mx-auto"
      >
        <SectionLabel>Rationale</SectionLabel>
        <h2 className="mt-4 font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
          Why we <span className="italic font-light">recommend</span> this.
        </h2>

        <div className="mt-10 space-y-6 text-body-lg text-text-secondary leading-relaxed">
          <p>
            Your profile suggests sustained sympathetic activation through the afternoon. L-tyrosine
            and Alpha-GPC in the morning support clean focus via dopamine and acetylcholine pathways —
            without the adrenergic load of caffeine, which your moderate-high stimulant sensitivity
            would make counterproductive by early afternoon.
          </p>
          <p>
            L-theanine at midday creates a buffer — reducing norepinephrine without impairing
            alertness — making your evening downshift protocol more effective. It smooths the
            transition from sustained output to recovery mode.
          </p>
          <p>
            The evening combination of magnesium L-threonate and apigenin targets the specific
            mechanisms your pattern needs: GABAergic calming and melatonin onset support. Your
            poor wind-down ability and delayed sleep onset pointed clearly to this combination.
          </p>
        </div>

        <Card variant="contextual" className="mt-12">
          <SectionLabel>Confidence</SectionLabel>
          <p className="mt-3 font-display font-normal text-heading text-accent -tracking-[0.02em]">
            High
          </p>
          <p className="mt-3 text-body text-text-secondary leading-relaxed">
            Your profile maps clearly to well-studied compounds with strong evidence for this state
            pattern. All three protocol items have robust clinical support.
          </p>
        </Card>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 px-5 sm:px-8 pb-6 pt-12 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <div className="max-w-xl mx-auto">
          <Button fullWidth size="lg" onClick={() => router.push('/reveal/expectations')}>
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
