'use client';

import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import type { GPPrep } from '@/lib/topics/types';

interface Props {
  gpPrep: GPPrep;
}

export function GPPrepCard({ gpPrep }: Props) {
  return (
    <Card variant="paper" className="mt-12">
      <div className="flex items-baseline gap-2.5 mb-2">
        <span className="font-mono text-label uppercase text-text-tertiary">·</span>
        <SectionLabel>Bring to your GP</SectionLabel>
      </div>
      <h3 className="mt-2 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
        Printable one-pager
      </h3>

      <div className="mt-6 space-y-6">
        {gpPrep.questionsToAsk.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary mb-2">
              Questions to ask
            </p>
            <ul className="space-y-2 text-body text-text-secondary leading-relaxed">
              {gpPrep.questionsToAsk.map((q, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-mono text-caption text-text-tertiary pt-0.5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1">{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {gpPrep.testsToConsiderRequesting.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary mb-2">
              Tests to consider
            </p>
            <ul className="space-y-1 text-body text-text-secondary leading-relaxed">
              {gpPrep.testsToConsiderRequesting.map((t, i) => (
                <li key={i}>&mdash; {t}</li>
              ))}
            </ul>
          </div>
        )}

        {gpPrep.relevantHistory.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary mb-2">
              Relevant history
            </p>
            <ul className="space-y-1 text-body text-text-secondary leading-relaxed">
              {gpPrep.relevantHistory.map((h, i) => (
                <li key={i}>&mdash; {h}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
