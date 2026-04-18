'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/**
 * Onboarding consent is stored client-side only in v1 (localStorage).
 * Server-side persistence of the acceptance timestamp lands in a follow-up
 * alongside a User.acceptedConsentAt column — flagged in the DPIA.
 */
const CONSENT_STORAGE_KEY = 'mf_consent_llm_accepted_at';

interface Slide {
  eyebrow: string;
  body: ReactNode;
}

const infoSlides: Slide[] = [
  {
    eyebrow: 'A system',
    body: (
      <>
        Morning Form builds a protocol around your <span className="italic font-light">biology</span>,
        not around a product catalogue.
      </>
    ),
  },
  {
    eyebrow: 'Eight minutes',
    body: (
      <>
        The assessment takes eight minutes. Your answers shape <span className="italic font-light">everything</span>.
      </>
    ),
  },
  {
    eyebrow: 'Always yours',
    body: (
      <>
        Your data stays yours. We <span className="italic font-light">explain</span> every recommendation.
      </>
    ),
  },
];

const TOTAL_STEPS = infoSlides.length + 1;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [consented, setConsented] = useState(false);
  const router = useRouter();

  const isConsentStep = step === infoSlides.length;

  const handleContinue = () => {
    if (step < infoSlides.length) {
      setStep(step + 1);
      return;
    }
    if (!consented) return;
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, new Date().toISOString());
    } catch {
      /* storage unavailable — best-effort; DB persistence ships in follow-up */
    }
    router.push('/assessment');
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="flex items-center justify-between px-5 sm:px-8 pt-8">
        <span className="text-label uppercase text-text-tertiary">Morning Form</span>
        {!isConsentStep && (
          <Link
            href="/assessment"
            className="text-caption text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
          >
            Skip →
          </Link>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
            className={isConsentStep ? 'max-w-xl' : 'text-center max-w-xl'}
          >
            {isConsentStep ? (
              <ConsentStep consented={consented} onToggle={setConsented} />
            ) : (
              <>
                <p className="text-label uppercase text-text-tertiary mb-4">
                  {infoSlides[step].eyebrow}
                </p>
                <p className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
                  {infoSlides[step].body}
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-2 mt-16">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-[3px] rounded-full transition-[width,background-color] duration-450 ease-spring ${
                i === step ? 'w-10 bg-accent' : 'w-5 bg-border-strong'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="px-5 sm:px-8 pb-12 sm:pb-16 max-w-xl mx-auto w-full">
        <Button
          fullWidth
          size="lg"
          onClick={handleContinue}
          disabled={isConsentStep && !consented}
        >
          {isConsentStep ? 'I agree — begin assessment →' : 'Continue →'}
        </Button>
        {isConsentStep && !consented && (
          <p
            role="alert"
            className="mt-3 text-caption text-text-tertiary text-center"
          >
            Tick the box above to continue.
          </p>
        )}
      </div>
    </div>
  );
}

function ConsentStep({
  consented,
  onToggle,
}: {
  consented: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-label uppercase text-text-tertiary">Before we begin</p>
      <h2 className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
        A note on <span className="italic font-light">how we process your data</span>.
      </h2>
      <div className="space-y-4 text-body text-text-secondary max-w-prose -tracking-[0.005em]">
        <p>
          Morning Form is a health information, interpretation, and decision-support
          service. It is not a medical device and does not replace clinical advice.
        </p>
        <p>
          Your health data will be shared with our LLM sub-processor — Anthropic PBC
          (United States) — under contract for generating interpretations. Anthropic
          processes your data under a zero-retention, no-training commitment. You can
          withdraw consent at any time in Settings → Privacy.
        </p>
        <p>
          Cross-border transfer is covered by the UK-US Data Bridge adequacy decision,
          with Standard Contractual Clauses as fallback. Full sub-processor disclosure
          is available on the{' '}
          <Link
            href="/settings/privacy"
            className="text-accent hover:underline underline-offset-4"
          >
            Privacy page
          </Link>
          .
        </p>
      </div>
      <label className="flex items-start gap-3 cursor-pointer select-none mt-2 pt-2">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => onToggle(e.target.checked)}
          aria-describedby="consent-copy"
          className="mt-1 h-4 w-4 rounded border-border-strong text-accent focus:ring-accent cursor-pointer"
        />
        <span id="consent-copy" className="text-caption text-text-primary">
          I consent to Morning Form processing my health data, including sharing it
          with Anthropic PBC for LLM-based interpretation as described above.
        </span>
      </label>
    </div>
  );
}
