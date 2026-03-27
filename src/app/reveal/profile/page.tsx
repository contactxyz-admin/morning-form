'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/section-label';
import { mockStateProfile } from '@/lib/mock-data';

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.15 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export default function ProfileRevealPage() {
  const router = useRouter();
  const profile = mockStateProfile;

  return (
    <div className="min-h-screen bg-bg px-5 pt-12 pb-32">
      <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-lg mx-auto">
        <motion.div variants={fadeUp}>
          <SectionLabel>YOUR STATE PROFILE</SectionLabel>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-8">
          <h2 className="text-heading font-medium text-text-primary">{profile.primaryPattern}</h2>
          <p className="mt-4 text-body text-text-secondary leading-relaxed">
            {profile.patternDescription}
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-10 border-t border-border pt-8">
          <SectionLabel>Key observations</SectionLabel>
          <ul className="mt-4 space-y-3">
            {profile.observations.map((obs) => (
              <li key={obs.label} className="text-body text-text-primary flex gap-2">
                <span className="text-text-tertiary shrink-0">·</span>
                <span>{obs.label}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-10 border-t border-border pt-8">
          <SectionLabel>Constraints noted</SectionLabel>
          <ul className="mt-4 space-y-3">
            {profile.constraints.map((c) => (
              <li key={c.label} className="text-body text-caution flex gap-2">
                <span className="shrink-0">·</span>
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-bg via-bg to-transparent pt-12">
        <Button fullWidth onClick={() => router.push('/reveal/protocol')}>
          Continue →
        </Button>
      </div>
    </div>
  );
}
