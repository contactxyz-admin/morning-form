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
    <div className="space-y-6 stagger">
      <header>
        <div className="flex items-baseline gap-2.5 mb-4">
          <span className="font-mono text-label uppercase text-text-whisper">02</span>
          <span className="text-label uppercase text-text-whisper">Narrative</span>
        </div>
        <h2 className="font-display text-display-sm sm:text-display font-light text-text-primary mb-4 -tracking-[0.035em]">
          Your story,{' '}
          <span className="italic text-accent">in your words.</span>
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
          className="w-full bg-transparent text-body-lg text-text-primary placeholder:text-text-whisper focus:outline-none resize-none -tracking-[0.005em] leading-relaxed"
          aria-label="Your medical story"
        />
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <p className="text-caption text-text-tertiary font-mono">
            {text.length === 0
              ? 'no characters yet'
              : `${text.length.toLocaleString()} characters`}
          </p>
          {text.trim().length > 0 && (
            <p className="inline-flex items-center gap-1.5 text-caption text-positive">
              <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-positive" />
              Saved as you type
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
