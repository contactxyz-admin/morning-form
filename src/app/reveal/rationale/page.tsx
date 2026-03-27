'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function RationalePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg px-5 pt-12 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg mx-auto"
      >
        <h2 className="text-heading font-medium text-text-primary">Why we recommend this</h2>

        <div className="mt-8 space-y-6 text-body text-text-secondary leading-relaxed">
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

        <Card variant="contextual" className="mt-10">
          <p className="text-body text-accent font-medium">
            Confidence: High
          </p>
          <p className="mt-2 text-caption text-text-secondary">
            Your profile maps clearly to well-studied compounds with strong evidence for this
            state pattern. All three protocol items have robust clinical support.
          </p>
        </Card>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-bg via-bg to-transparent pt-12">
        <Button fullWidth onClick={() => router.push('/reveal/expectations')}>
          Continue →
        </Button>
      </div>
    </div>
  );
}
