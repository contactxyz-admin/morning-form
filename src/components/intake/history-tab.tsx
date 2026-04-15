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
    <div className="space-y-4">
      <Card>
        <h2 className="text-h3 font-semibold mb-1">Your story, in your words</h2>
        <p className="text-body text-text-secondary mb-4">
          Free-text history. The more you tell us, the better the graph. We extract symptoms,
          conditions, medications, and the events that connect them.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={14}
          className="w-full px-4 py-3 rounded-input border border-border bg-surface text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
          aria-label="Your medical story"
        />
        <p className="mt-2 text-caption text-text-tertiary text-right">
          {text.length} characters
        </p>
      </Card>
    </div>
  );
}
