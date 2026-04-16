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
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-xl mx-auto">
        <motion.div variants={fadeUp}>
          <SectionLabel>Your protocol</SectionLabel>
          <h2 className="mt-4 font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
            Sustained activation.
            <br />
            <span className="italic font-light">Clean</span> downshift.
          </h2>
        </motion.div>

        <div className="mt-12 space-y-4">
          {mockProtocolItems.map((item) => (
            <motion.div key={item.id} variants={fadeUp}>
              <Card variant="default" className="space-y-3">
                <SectionLabel>{item.timeLabel}</SectionLabel>
                <h3 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                  {item.compounds}
                </h3>
                <p className="font-mono text-data text-accent">{item.dosage}</p>
                <p className="text-caption text-text-tertiary">{item.timingCue}</p>
                <p className="text-body text-text-secondary leading-relaxed">
                  {item.mechanism.split('.')[0]}.
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 px-5 sm:px-8 pb-6 pt-12 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <div className="max-w-xl mx-auto">
          <Button fullWidth size="lg" onClick={() => router.push('/reveal/rationale')}>
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
