'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const steps = [
  'Analysing your state patterns',
  'Mapping sensitivities',
  'Building your protocol',
];

export default function ProcessingPage() {
  const router = useRouter();
  const [visibleSteps, setVisibleSteps] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setVisibleSteps(1), 400),
      setTimeout(() => setVisibleSteps(2), 2400),
      setTimeout(() => setVisibleSteps(3), 4400),
      setTimeout(() => router.push('/reveal/profile'), 7500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-8 relative overflow-hidden">
      {/* subtle radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 45%, rgba(31, 58, 46, 0.35) 0px, transparent 45%)',
        }}
      />

      <div className="relative space-y-6 max-w-md">
        <p className="text-label uppercase tracking-[0.14em] text-text-secondary mb-8">
          Processing
        </p>
        {steps.map((step, i) => (
          <motion.p
            key={step}
            initial={{ opacity: 0, filter: 'blur(6px)', y: 6 }}
            animate={
              i < visibleSteps
                ? { opacity: 1, filter: 'blur(0px)', y: 0 }
                : { opacity: 0, filter: 'blur(6px)', y: 6 }
            }
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-light text-heading sm:text-subheading text-surface-warm -tracking-[0.015em]"
          >
            {step}
          </motion.p>
        ))}
      </div>
    </div>
  );
}
