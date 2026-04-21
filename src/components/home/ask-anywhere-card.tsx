'use client';

/**
 * Home-surface entry point into the chat assistant. Mirrors the
 * RecordAnchorCard pattern: small section label, heading, body.
 * Submit navigates to `/ask?seed=<encoded>` so the chat page
 * auto-fires the first turn from the composer's initialValue seam.
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildAskHref } from './ask-anywhere-helpers';

export function AskAnywhereCard() {
  const router = useRouter();
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const href = buildAskHref(value);
    if (!href) return;
    router.push(href);
  }

  return (
    <Card variant="action" accentColor="teal">
      <div className="flex items-baseline gap-2.5 mb-2">
        <span className="font-mono text-label uppercase text-text-tertiary">·</span>
        <span className="text-label uppercase text-text-tertiary">Ask anything</span>
      </div>
      <h3 className="mt-2 font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
        Ask anything about your health.
      </h3>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
        <div
          className={cn(
            'flex items-end gap-2',
            'rounded-card border border-border bg-surface px-3 py-2',
            'focus-within:border-border-strong focus-within:shadow-card-hover',
            'transition-[border-color,box-shadow] duration-300 ease-spring',
          )}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Why is my ferritin low?"
            className={cn(
              'flex-1 bg-transparent text-body text-text-primary placeholder:text-text-tertiary',
              'focus:outline-none py-2',
            )}
            aria-label="Ask a question"
          />
          <Button type="submit" variant="primary" size="sm" disabled={value.trim().length === 0}>
            Ask
          </Button>
        </div>
        <p className="text-caption text-text-tertiary">
          Your specialist routes you to the right context — iron, sleep & recovery, energy & fatigue.
        </p>
      </form>
    </Card>
  );
}
