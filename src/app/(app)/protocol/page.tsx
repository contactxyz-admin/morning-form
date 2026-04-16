'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { Icon } from '@/components/ui/icon';
import { mockProtocol, mockProtocolItems } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

export default function ProtocolPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="px-5 pt-6 pb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-label uppercase text-text-tertiary">Protocol</p>
        <span className="font-mono text-caption text-text-tertiary">v{mockProtocol.version}</span>
      </div>
      <h1 className="font-display font-light text-display-sm sm:text-display text-text-primary mb-5 -tracking-[0.03em]">
        Designed for <span className="italic font-light">you</span>.
      </h1>
      <p className="text-body-lg text-text-secondary mb-10 max-w-lg">
        Sustained activation in the morning, clean downshift by evening — engineered around
        your patterns, not generalized advice.
      </p>

      {/* Timeline */}
      <div className="relative pl-8">
        <div className="absolute left-3 top-4 bottom-4 w-px bg-border" />

        {mockProtocolItems.map((item) => {
          const isExpanded = expanded === item.id;
          return (
            <div key={item.id} className="relative mb-6 last:mb-0">
              <div className={cn(
                'absolute -left-5 top-6 w-2.5 h-2.5 rounded-full border-2 border-bg transition-colors',
                isExpanded ? 'bg-accent' : 'bg-accent/50'
              )} />

              <Card
                variant="default"
                clickable
                onClick={() => setExpanded(isExpanded ? null : item.id)}
                className="cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <SectionLabel>{item.timeLabel}</SectionLabel>
                    <h3 className="mt-2 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">{item.compounds}</h3>
                    <p className="mt-1 font-mono text-data text-accent">{item.dosage}</p>
                    <p className="mt-1 text-caption text-text-tertiary">{item.timingCue}</p>
                  </div>
                  <Icon
                    name="chevron-down"
                    size="sm"
                    className={cn('text-text-tertiary transition-transform mt-1', isExpanded && 'rotate-180')}
                  />
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-body text-text-secondary leading-relaxed">{item.mechanism}</p>
                        <div className="mt-4 flex items-center gap-2">
                          <span className="text-caption text-text-tertiary">Evidence tier:</span>
                          <span className="text-caption font-medium text-positive capitalize">{item.evidenceTier}</span>
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
      <Card variant="contextual" className="mt-8">
        <p className="text-caption text-text-secondary">
          <span className="font-medium text-accent">Confidence: {mockProtocol.confidence}</span> — Your profile maps clearly to well-studied compounds.
        </p>
      </Card>
    </div>
  );
}
