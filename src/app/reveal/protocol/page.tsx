'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { mockProtocolItems } from '@/lib/mock-data';

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.2, delayChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

export default function ProtocolRevealPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg px-5 pt-12 pb-32">
      <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-lg mx-auto">
        <motion.div variants={fadeUp}>
          <SectionLabel>YOUR PROTOCOL</SectionLabel>
          <p className="mt-2 text-body text-text-secondary">
            Designed for sustained activation → clean downshift
          </p>
        </motion.div>

        <div className="mt-10 space-y-4">
          {mockProtocolItems.map((item) => (
            <motion.div key={item.id} variants={fadeUp}>
              <Card variant="default" className="space-y-3">
                <SectionLabel>{item.timeLabel}</SectionLabel>
                <h3 className="text-subheading font-medium text-text-primary">{item.compounds}</h3>
                <p className="font-mono text-data text-accent">{item.dosage}</p>
                <p className="text-caption text-text-tertiary">{item.timingCue}</p>
                <p className="text-caption text-text-secondary leading-relaxed">
                  {item.mechanism.split('.')[0]}.
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-bg via-bg to-transparent pt-12">
        <Button fullWidth onClick={() => router.push('/reveal/rationale')}>
          Continue →
        </Button>
      </div>
    </div>
  );
}
