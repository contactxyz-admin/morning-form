'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SectionLabel } from '@/components/ui/section-label';
import { cn } from '@/lib/utils';
import { buildInlineSpans } from '@/lib/topics/cross-link';
import type { Citation, Section } from '@/lib/topics/types';

/**
 * A single tier of the compiled topic page.
 *
 * Body is plain markdown-esque text; we intentionally do not mount a full
 * markdown renderer here. Structured sections stay legible as a block, and
 * the LLM contract keeps formatting simple (paragraphs + bullet lines).
 *
 * Cross-linking (R6): when `onCitationClick` is provided, citation
 * excerpts inside the prose are wrapped as inline buttons that open the
 * corresponding node's detail sheet. Source citations in the expanded
 * footer can deep-link to `/record/source/[id]` when `chunkToSource`
 * supplies the owning source id for their chunkId.
 *
 * Share-view posture: the `/share/[token]` renderer mounts this component
 * without `onCitationClick` / `chunkToSource`, so prose renders flat and
 * no deep-links are exposed to anonymous viewers.
 */

interface Props {
  ordinal: string;
  kicker: string;
  section: Section;
  accent?: 'teal' | 'amber' | 'sage';
  onCitationClick?: (nodeId: string) => void;
  /** chunkId -> sourceDocumentId. Empty/omitted in the share view. */
  chunkToSource?: Record<string, string>;
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
  chunkToSource,
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
        <BodyProse
          bodyMarkdown={section.bodyMarkdown}
          citations={section.citations}
          onCitationClick={onCitationClick}
        />

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
                  <CitationRow
                    key={`${c.nodeId}-${i}`}
                    citation={c}
                    ordinal={i + 1}
                    onCitationClick={onCitationClick}
                    sourceId={
                      c.chunkId && chunkToSource ? chunkToSource[c.chunkId] : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CitationRow({
  citation,
  ordinal,
  onCitationClick,
  sourceId,
}: {
  citation: Citation;
  ordinal: number;
  onCitationClick?: (nodeId: string) => void;
  sourceId?: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="font-mono text-[10px] text-text-tertiary mt-0.5">
        {String(ordinal).padStart(2, '0')}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <button
          type="button"
          onClick={onCitationClick ? () => onCitationClick(citation.nodeId) : undefined}
          className={cn(
            'w-full text-left text-caption text-text-secondary leading-relaxed',
            onCitationClick && 'hover:text-text-primary',
            'transition-colors duration-300 ease-spring',
          )}
        >
          &ldquo;{citation.excerpt}&rdquo;
        </button>
        {sourceId && (
          <Link
            href={`/record/source/${encodeURIComponent(sourceId)}`}
            className={cn(
              'inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em]',
              'text-text-tertiary hover:text-text-primary',
              'transition-colors duration-300 ease-spring',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
            )}
          >
            <span aria-hidden>→</span>
            <span>View source</span>
          </Link>
        )}
      </div>
    </li>
  );
}

function BodyProse({
  bodyMarkdown,
  citations,
  onCitationClick,
}: {
  bodyMarkdown: string;
  citations: Citation[];
  onCitationClick?: (nodeId: string) => void;
}) {
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
                <li key={j}>
                  <InlineText
                    text={l.trim().replace(/^-\s+/, '')}
                    citations={citations}
                    onCitationClick={onCitationClick}
                  />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            <InlineText
              text={block}
              citations={citations}
              onCitationClick={onCitationClick}
            />
          </p>
        );
      })}
    </div>
  );
}

function InlineText({
  text,
  citations,
  onCitationClick,
}: {
  text: string;
  citations: Citation[];
  onCitationClick?: (nodeId: string) => void;
}) {
  if (!onCitationClick || citations.length === 0) {
    return <>{text}</>;
  }
  const spans = buildInlineSpans(text, citations);
  return (
    <>
      {spans.map((span, i) => {
        if (span.kind === 'text') {
          return <span key={i}>{span.content}</span>;
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => onCitationClick(span.nodeId)}
            className={cn(
              'inline text-left underline decoration-border-hover decoration-[1.5px] underline-offset-[3px]',
              'text-text-primary hover:decoration-accent hover:text-accent',
              'transition-colors duration-300 ease-spring',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus rounded-[2px]',
            )}
          >
            {span.content}
          </button>
        );
      })}
    </>
  );
}
