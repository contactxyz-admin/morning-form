'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const steps = [
  'Analyzing your state patterns',
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
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-8">
      <div className="space-y-5">
        {steps.map((step, i) => (
          <motion.p
            key={step}
            initial={{ opacity: 0, filter: 'blur(4px)', y: 4 }}
            animate={
              i < visibleSteps
                ? { opacity: 1, filter: 'blur(0px)', y: 0 }
                : { opacity: 0, filter: 'blur(4px)', y: 4 }
            }
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-subheading text-[#E5E5E3] font-sans"
          >
            {step}
          </motion.p>
        ))}
      </div>
    </div>
  );
}
