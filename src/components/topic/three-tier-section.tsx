'use client';

import { useState } from 'react';
import { SectionLabel } from '@/components/ui/section-label';
import { cn } from '@/lib/utils';
import type { Section } from '@/lib/topics/types';

/**
 * A single tier of the compiled topic page.
 *
 * Body is plain markdown-esque text; we intentionally do not mount a full
 * markdown renderer here. Structured sections stay legible as a block, and
 * the LLM contract keeps formatting simple (paragraphs + bullet lines).
 * Citations render as a collapsible footer list — hidden by default so the
 * prose reads as a finished artefact, one tap away from full provenance.
 */

interface Props {
  ordinal: string;
  kicker: string;
  section: Section;
  accent?: 'teal' | 'amber' | 'sage';
  onCitationClick?: (nodeId: string) => void;
}

const ACCENT_BAR: Record<NonNullable<Props['accent']>, string> = {
  teal: 'bg-accent',
  amber: 'bg-caution',
  sage: 'bg-positive',
};

export function ThreeTierSection({
  ordinal,
  kicker,
  section,
  accent = 'teal',
  onCitationClick,
}: Props) {
  const [citationsOpen, setCitationsOpen] = useState(false);
  return (
    <section className="relative">
      <div
        aria-hidden
        className={cn(
          'absolute left-0 top-1 bottom-1 w-[2px] rounded-full',
          ACCENT_BAR[accent],
        )}
      />
      <div className="pl-6">
        <div className="flex items-baseline gap-3 mb-4">
          <span className="font-mono text-label uppercase text-text-tertiary">{ordinal}</span>
          <SectionLabel>{kicker}</SectionLabel>
        </div>
        <h2 className="font-display font-light text-display-sm text-text-primary -tracking-[0.028em] leading-[1.05] mb-5">
          {section.heading}
        </h2>
        <BodyProse bodyMarkdown={section.bodyMarkdown} />

        {section.citations.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setCitationsOpen((v) => !v)}
              className={cn(
                'font-mono text-[10px] uppercase tracking-[0.08em]',
                'text-text-tertiary hover:text-text-primary',
                'transition-colors duration-300 ease-spring',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
              )}
            >
              {citationsOpen
                ? '— Hide sources'
                : `+ ${section.citations.length} source${section.citations.length === 1 ? '' : 's'}`}
            </button>
            {citationsOpen && (
              <ul className="mt-3 space-y-2 border-t border-border/60 pt-3">
                {section.citations.map((c, i) => (
                  <li key={`${c.nodeId}-${i}`} className="flex items-start gap-3">
                    <span className="font-mono text-[10px] text-text-tertiary mt-0.5">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={
                        onCitationClick ? () => onCitationClick(c.nodeId) : undefined
                      }
                      className={cn(
                        'flex-1 text-left text-caption text-text-secondary leading-relaxed',
                        onCitationClick && 'hover:text-text-primary',
                        'transition-colors duration-300 ease-spring',
                      )}
                    >
                      &ldquo;{c.excerpt}&rdquo;
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function BodyProse({ bodyMarkdown }: { bodyMarkdown: string }) {
  // Split on blank lines → paragraphs. Within each, convert leading "- "
  // lines into a <ul>. Keeps the rendering predictable without a markdown
  // dependency and mirrors the LLM contract (paragraphs + bullet lines).
  const blocks = bodyMarkdown.split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="space-y-4 text-body text-text-secondary leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const isBulletBlock = lines.every((l) => l.trim().startsWith('- '));
        if (isBulletBlock) {
          return (
            <ul key={i} className="space-y-2 pl-4 list-disc marker:text-text-tertiary/60">
              {lines.map((l, j) => (
                <li key={j}>{l.trim().replace(/^-\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}
