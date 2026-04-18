'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { Icon } from '@/components/ui/icon';
import { useAssessmentData } from '@/lib/hooks/use-assessment-data';
import type { Protocol } from '@/types';
import { cn } from '@/lib/utils';

export default function ProtocolPage() {
  const router = useRouter();
  const state = useAssessmentData();

  useEffect(() => {
    if (state.kind === 'not-onboarded') router.replace('/assessment');
    if (state.kind === 'unauthenticated') router.replace('/sign-in');
  }, [state.kind, router]);

  if (state.kind !== 'ready') {
    return (
      <div className="px-5 pt-6 pb-8 grain-page">
        <div className="flex items-center gap-2.5 mb-5">
          <span aria-hidden className="block w-6 h-px bg-text-primary/60" />
          <span className="text-label uppercase text-text-tertiary">Protocol</span>
        </div>
        <p className="text-caption text-text-tertiary">
          {state.kind === 'error' ? 'Couldn’t load your protocol.' : 'Loading…'}
        </p>
      </div>
    );
  }

  return <ProtocolView protocol={state.data.protocol} />;
}

function ProtocolView({ protocol }: { protocol: Protocol }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const items = protocol.items;

  return (
    <div className="px-5 pt-6 pb-8 grain-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="block w-6 h-px bg-text-primary/60" />
          <span className="text-label uppercase text-text-tertiary">Protocol</span>
        </div>
        <span className="font-mono text-caption text-text-tertiary">v{protocol.version}</span>
      </div>

      <div className="rise">
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary mb-5 -tracking-[0.04em]">
          Designed for <span className="italic text-accent">you</span>.
        </h1>
        <p className="text-body-lg text-text-secondary mb-12 max-w-lg">
          {protocol.rationale}
        </p>
      </div>

      {/* Timeline */}
      <div className="relative pl-8 stagger">
        <div aria-hidden className="absolute left-3 top-4 bottom-4 w-px bg-border" />

        {items.map((item, index) => {
          const isExpanded = expanded === item.id;
          return (
            <div key={item.id} className="relative mb-5 last:mb-0">
              <div
                aria-hidden
                className={cn(
                  'absolute -left-[19px] top-6 w-2 h-2 rounded-full border-2 border-bg transition-[background-color,transform] duration-300 ease-spring',
                  isExpanded ? 'bg-accent scale-125' : 'bg-accent/50',
                )}
              />

              <Card
                variant="default"
                clickable
                onClick={() => setExpanded(isExpanded ? null : item.id)}
                className="cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2.5 mb-2">
                      <span className="font-mono text-label uppercase text-text-tertiary">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="text-label uppercase text-text-tertiary">{item.timeLabel}</span>
                    </div>
                    <h3 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
                      {item.compounds}
                    </h3>
                    <p className="mt-1 font-mono text-data text-accent">{item.dosage}</p>
                    <p className="mt-1 text-caption text-text-tertiary">{item.timingCue}</p>
                  </div>
                  <Icon
                    name="chevron-down"
                    size="sm"
                    className={cn(
                      'text-text-tertiary transition-transform duration-300 ease-spring mt-1 shrink-0',
                      isExpanded && 'rotate-180',
                    )}
                  />
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-body text-text-secondary leading-relaxed">
                          {item.mechanism}
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                          <span className="font-mono text-caption text-text-tertiary uppercase tracking-[0.14em]">
                            Evidence tier
                          </span>
                          <span className="text-caption font-medium text-positive capitalize">
                            {item.evidenceTier}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Confidence */}
      <Card variant="contextual" className="mt-10">
        <p className="text-caption text-text-secondary leading-relaxed">
          <span className="font-medium text-accent capitalize">Confidence: {protocol.confidence}</span>
          {' — '}
          Your profile maps clearly to well-studied compounds.
        </p>
      </Card>
    </div>
  );
}
