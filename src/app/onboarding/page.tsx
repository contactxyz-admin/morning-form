'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const slides: { eyebrow: string; body: React.ReactNode }[] = [
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

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const router = useRouter();

  const handleContinue = () => {
    if (step < 2) {
      setStep(step + 1);
    } else {
      router.push('/assessment');
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 sm:px-8 pt-8">
        <span className="text-label uppercase text-text-tertiary">Morning Form</span>
        <Link
          href="/assessment"
          className="text-caption text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
        >
          Skip →
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
            className="text-center max-w-xl"
          >
            <p className="text-label uppercase text-text-tertiary mb-4">{slides[step].eyebrow}</p>
            <p className="font-display font-light text-display-sm sm:text-display text-text-primary -tracking-[0.03em] leading-[1.1]">
              {slides[step].body}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex gap-2 mt-16">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-[3px] rounded-full transition-[width,background-color] duration-450 ease-spring ${
                i === step ? 'w-10 bg-accent' : 'w-5 bg-border-strong'
              }`}
            />
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 sm:px-8 pb-12 sm:pb-16 max-w-xl mx-auto w-full">
        <Button fullWidth size="lg" onClick={handleContinue}>
          {step === 2 ? 'Begin assessment →' : 'Continue →'}
        </Button>
      </div>
    </div>
  );
}
