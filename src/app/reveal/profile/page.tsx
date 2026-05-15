'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/section-label';
import { useAssessmentData } from '@/lib/hooks/use-assessment-data';
import { RevealNotOnboardedCard } from '@/components/reveal/not-onboarded-card';
import { track } from '@/lib/funnel/track';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';

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
  const state = useAssessmentData();
  const trackedRef = useRef(false);

  useEffect(() => {
    // Auth still hard-redirects (no value to render without it).
    if (state.kind === 'unauthenticated') router.replace('/sign-in');
    // Fire reveal_viewed exactly once, only when we actually show the
    // user their profile — guards against firing during the loading or
    // not-onboarded states.
    if (state.kind === 'ready' && !trackedRef.current) {
      trackedRef.current = true;
      track(FUNNEL_EVENTS.REVEAL_VIEWED);
    }
  }, [state.kind, router]);

  // Soft fallback for un-assessed users — the assessment is optional
  // since 2026-05-15; the reveal pages stay rendered and surface a
  // "Personalise your record" CTA instead of auto-routing into /assessment.
  if (state.kind === 'not-onboarded') {
    return <RevealNotOnboardedCard surface="profile" />;
  }

  if (state.kind !== 'ready') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-5">
        <p className="text-caption text-text-tertiary">
          {state.kind === 'error' ? 'Something went wrong.' : 'Loading…'}
        </p>
      </div>
    );
  }

  const profile = state.data.stateProfile;

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-xl mx-auto">
        <motion.div variants={fadeUp}>
          <SectionLabel>Your state profile</SectionLabel>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-8">
          <h2 className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
            {profile.primaryPattern}
          </h2>
          <p className="mt-6 text-body-lg text-text-secondary leading-relaxed">
            {profile.patternDescription}
          </p>
        </motion.div>

        {profile.observations.length > 0 && (
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
        )}

        {profile.constraints.length > 0 && (
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
        )}
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 px-5 sm:px-8 pb-6 pt-12 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <div className="max-w-xl mx-auto">
          <Button fullWidth size="lg" onClick={() => router.push('/reveal/priorities')}>
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
