'use client';

import { Card } from '@/components/ui/card';
import { useIntakeStore } from '@/lib/intake/store';

const PLACEHOLDER = `Paste your GP record, write your medical story, or jot anything that feels relevant. Things like:

— how you've been feeling lately
— surgeries, hospitalisations, major illnesses
— family history that matters
— anything your doctor said you should track

Don't overthink the structure — we'll pull the facts apart.`;

export function HistoryTab() {
  const text = useIntakeStore((s) => s.historyText);
  const setText = useIntakeStore((s) => s.setHistoryText);

  return (
    <div className="space-y-5 stagger">
      <header>
        <p className="text-label uppercase text-text-tertiary mb-3">02 — Narrative</p>
        <h2 className="font-display text-display-sm sm:text-display font-light text-text-primary mb-3 -tracking-[0.035em]">
          Your story, <span className="italic">in your words.</span>
        </h2>
        <p className="text-body-lg text-text-secondary max-w-lg">
          Free-text history. The more you tell us, the better the graph. We extract symptoms,
          conditions, medications, and the events that connect them.
        </p>
      </header>

      <Card>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={16}
          className="w-full bg-transparent text-body-lg text-text-primary placeholder:text-text-tertiary focus:outline-none resize-none -tracking-[0.005em] leading-relaxed"
          aria-label="Your medical story"
        />
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <p className="text-caption text-text-tertiary">
            {text.length === 0 ? 'No characters yet' : `${text.length.toLocaleString()} characters`}
          </p>
          {text.trim().length > 0 && (
            <p className="text-caption text-positive">Saved as you type</p>
          )}
        </div>
      </Card>
    </div>
  );
}
