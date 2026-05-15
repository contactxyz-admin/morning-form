'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { clearDraft } from '@/lib/assessment-draft';

const steps = [
  'Analysing your state patterns',
  'Mapping sensitivities',
  'Building your protocol',
];

// Minimum dwell time on this page so the reveal feels considered even on a
// fast network. The API call runs in parallel — we wait for the later of the
// two before advancing. 3s is enough for the three-step animation to feel
// deliberate; longer reads as theatre tax (was 7500 originally — cut after
// the activation audit flagged "forced wait on fast networks" as A4).
const MIN_DWELL_MS = 3000;

export default function ProcessingPage() {
  const router = useRouter();
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    // Step fade-ins paced so all three land before MIN_DWELL_MS expires —
    // otherwise the third step would render after the redirect and never
    // be seen on a fast network.
    const stepTimers = [
      setTimeout(() => setVisibleSteps(1), 200),
      setTimeout(() => setVisibleSteps(2), 1100),
      setTimeout(() => setVisibleSteps(3), 2000),
    ];

    let cancelled = false;

    async function run() {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('mf_assessment') : null;
      if (!raw) {
        // No assessment in localStorage — the user landed here out of order.
        // Punt them back to /assessment rather than persist an empty response.
        router.replace('/assessment');
        return;
      }
      let responses: unknown;
      try {
        responses = JSON.parse(raw);
      } catch {
        router.replace('/assessment');
        return;
      }

      const startedAt = Date.now();
      try {
        const res = await fetch('/api/assessment', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ responses }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to save your assessment');
        }
        return;
      }

      // POST succeeded — the assessment is durably persisted server-side.
      // Clear the in-progress draft so a future visit to /assessment
      // doesn't rehydrate stale answers. Leave `mf_assessment` in place
      // so a refresh of this page during MIN_DWELL_MS works.
      clearDraft();

      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_DWELL_MS - elapsed);
      setTimeout(() => {
        if (!cancelled) router.push('/reveal/profile');
      }, remaining);
    }

    run();

    return () => {
      cancelled = true;
      stepTimers.forEach(clearTimeout);
    };
  }, [router, retrying]);

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

        {error && (
          <div className="pt-8">
            <p className="text-caption text-alert mb-4">
              Something went wrong saving your assessment. ({error})
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setVisibleSteps(0);
                setRetrying((r) => !r);
              }}
              className="text-caption text-surface-warm underline underline-offset-4 hover:opacity-80"
            >
              Try again →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
