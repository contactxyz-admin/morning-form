'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { useAssessmentData } from '@/lib/hooks/use-assessment-data';

const CONFIDENCE_COPY: Record<'high' | 'moderate' | 'low', string> = {
  high: 'Your profile maps clearly to well-studied compounds with strong evidence for this state pattern.',
  moderate:
    'Your profile points to a likely pattern, but we have moderate confidence — signals are consistent but not overdetermined.',
  low: 'Your responses leave more room for interpretation. This protocol is a reasonable starting point; we may refine it as we learn more.',
};

export default function RationalePage() {
  const router = useRouter();
  const state = useAssessmentData();

  useEffect(() => {
    if (state.kind === 'not-onboarded') router.replace('/assessment');
    if (state.kind === 'unauthenticated') router.replace('/sign-in');
  }, [state.kind, router]);

  if (state.kind !== 'ready') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-5">
        <p className="text-caption text-text-tertiary">
          {state.kind === 'error' ? 'Something went wrong.' : 'Loading…'}
        </p>
      </div>
    );
  }

  const { protocol } = state.data;
  const paragraphs = protocol.rationale
    .split(/\n\s*\n/) // blank-line paragraph split
    .map((p) => p.trim())
    .filter(Boolean);
  const paragraphsToRender =
    paragraphs.length > 1 ? paragraphs : splitBySentence(protocol.rationale, 2);
  const confidenceLabel =
    protocol.confidence.charAt(0).toUpperCase() + protocol.confidence.slice(1);

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
          {paragraphsToRender.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <Card variant="contextual" className="mt-12">
          <SectionLabel>Confidence</SectionLabel>
          <p className="mt-3 font-display font-normal text-heading text-accent -tracking-[0.02em]">
            {confidenceLabel}
          </p>
          <p className="mt-3 text-body text-text-secondary leading-relaxed">
            {CONFIDENCE_COPY[protocol.confidence]}
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

// The protocol-engine emits a single-paragraph rationale. Breaking roughly in
// half by sentence keeps the reveal page's existing two-column reading rhythm
// without forcing the engine to change shape.
function splitBySentence(text: string, chunks: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) ?? [text];
  if (sentences.length <= chunks) return [text];
  const per = Math.ceil(sentences.length / chunks);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += per) {
    out.push(sentences.slice(i, i + per).join('').trim());
  }
  return out;
}
