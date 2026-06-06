'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { useAssessmentData } from '@/lib/hooks/use-assessment-data';
import { RevealNotOnboardedCard } from '@/components/reveal/not-onboarded-card';
import {
  reviewerForArchetype,
  type Archetype,
} from '@/lib/priority-marker-engine';
import { trackIntakeClickAndRedirect } from './actions';

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.18, delayChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

const PANEL_LABEL: Record<'uk' | 'us' | 'both' | 'neither', string> = {
  uk: 'Included in most UK private panels',
  us: 'Included in most US private panels',
  both: 'Standard on most private panels',
  neither: 'Less commonly included — ask your provider',
};

/**
 * Reveal climax — replaces the previous-gen `/reveal/protocol`. Renders the
 * user's priority biomarker recommendations (data-acquisition guidance, not
 * intervention guidance) and routes the primary CTA into `/intake`.
 *
 * Phase 1 of the priority-markers pivot ships against placeholder marker
 * content from `priority-marker-engine.ts`; Phase 2 replaces the placeholders
 * with clinical-reviewer-approved content. The page logic is the same in
 * both phases — it renders whatever the engine produces.
 */
/**
 * Default export was previously the route's page component; now this is
 * rendered conditionally by the route's server wrapper (page.tsx) when the
 * PRIORITY_MARKERS_ENABLED flag is set. With the flag off, the wrapper
 * renders the interstitial instead.
 */
export function PrioritiesClient() {
  const router = useRouter();
  const state = useAssessmentData();

  useEffect(() => {
    if (state.kind === 'unauthenticated') router.replace('/sign-in');
  }, [state.kind, router]);

  // Soft fallback — assessment optional since 2026-05-15.
  if (state.kind === 'not-onboarded') {
    return <RevealNotOnboardedCard surface="priorities" />;
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

  const { stateProfile, priorities } = state.data;
  // Discreet medical-reviewer attribution. Resolves to null for the internal
  // editorial key (today's content), so nothing renders until a real clinical
  // sign-off flips the reviewerKey in the content files.
  const reviewer = reviewerForArchetype(stateProfile.archetype as Archetype);

  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-xl mx-auto">
        <motion.div variants={fadeUp}>
          <SectionLabel>Your priority markers</SectionLabel>
          <h2 className="mt-4 font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
            {stateProfile.primaryPattern}
          </h2>
          <p className="mt-6 text-body-lg text-text-secondary leading-relaxed">
            Based on your responses, these are the biomarkers we&rsquo;d look at first
            for someone with your profile. Upload an existing panel or order one
            below — your record will translate the values into plain English.
          </p>
        </motion.div>

        <div className="mt-12 space-y-4">
          {priorities.items.map((marker) => (
            <motion.div key={marker.id} variants={fadeUp}>
              <a
                href={`/reveal/priorities/marker/${encodeURIComponent(marker.markerName)}?archetype=${stateProfile.archetype}`}
                className="block group"
              >
                <Card variant="default" className="space-y-3 group-hover:border-text-tertiary/30 transition-colors">
                  <SectionLabel>{marker.category}</SectionLabel>
                  <h3 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                    {marker.markerName}
                  </h3>
                  <p className="text-body text-text-secondary leading-relaxed">
                    {marker.rationale}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                      {PANEL_LABEL[marker.panelAvailability]}
                    </p>
                    <span className="font-mono text-[11px] text-text-tertiary group-hover:text-text-secondary transition-colors">
                      How to get tested →
                    </span>
                  </div>
                </Card>
              </a>
            </motion.div>
          ))}
        </div>

        {reviewer && (
          <motion.p
            variants={fadeUp}
            className="mt-8 text-caption text-text-tertiary"
          >
            {reviewer.line} · {reviewer.reviewedAt}
          </motion.p>
        )}
      </motion.div>

      <div className="fixed bottom-0 left-0 right-0 px-5 sm:px-8 pb-6 pt-12 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <div className="max-w-xl mx-auto flex flex-col gap-3">
          <Button
            fullWidth
            size="lg"
            variant="secondary"
            onClick={() => router.push('/reveal/rationale')}
          >
            See why these markers
          </Button>
          <form action={trackIntakeClickAndRedirect}>
            <Button type="submit" fullWidth size="lg" variant="ghost">
              Already have recent results? Upload them →
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
