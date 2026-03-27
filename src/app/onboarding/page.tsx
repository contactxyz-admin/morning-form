'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const slides = [
  'Morning Form builds a protocol around your biology, not around a product catalog.',
  'The assessment takes 8 minutes. Your answers shape everything.',
  'Your data stays yours. We explain every recommendation.',
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
      {/* Skip */}
      <div className="flex justify-end px-5 pt-6">
        <Link href="/assessment" className="text-caption text-text-tertiary hover:text-text-secondary transition-colors">
          Skip →
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.p
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="text-heading text-text-primary text-center max-w-sm leading-relaxed"
          >
            {slides[step]}
          </motion.p>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex gap-2 mt-12">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                i === step ? 'bg-accent' : 'bg-border'
              }`}
            />
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-12">
        <Button fullWidth onClick={handleContinue}>
          {step === 2 ? 'Begin Assessment →' : 'Continue →'}
        </Button>
      </div>
    </div>
  );
}
