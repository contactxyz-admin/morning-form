'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SectionLabel } from '@/components/ui/section-label';
import type { LogEntry, LogEntryKind } from '@/lib/record/types';
import type { TopicLog, TopicLogSummary } from '@/lib/record/log';

interface TopicLogFooterProps {
  topicKey: string;
}

const kindGlyph: Record<LogEntryKind, string> = {
  'source-added': '◇',
  'topic-compiled': '●',
  'node-added': '·',
};

function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function summaryLine(summary: TopicLogSummary): string {
  const parts: string[] = [];
  if (summary.lastCompiledAt) {
    parts.push(`Last compiled · ${formatWhen(summary.lastCompiledAt)}`);
  } else {
    parts.push('Not yet compiled');
  }
  parts.push(`${summary.sourceCount} source${summary.sourceCount === 1 ? '' : 's'}`);
  parts.push(`${summary.nodeCount} node${summary.nodeCount === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function TopicLogFooter({ topicKey }: TopicLogFooterProps) {
  const [log, setLog] = useState<TopicLog | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLog(null);
    setErrored(false);
    (async () => {
      try {
        const res = await fetch(
          `/api/topics/${encodeURIComponent(topicKey)}/log`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          if (!cancelled) setErrored(true);
          return;
        }
        const json = (await res.json()) as TopicLog;
        if (!cancelled) setLog(json);
      } catch {
        if (!cancelled) setErrored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicKey]);

  if (errored || !log || log.entries.length === 0) return null;

  const summary = log.summary;

  return (
    <section className="mt-16 border-t border-border/60 pt-8">
      <SectionLabel className="text-text-whisper">Log</SectionLabel>
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
        className="mt-4 flex w-full items-center justify-between gap-4 text-left group"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-body text-text-secondary -tracking-[0.003em]">
            {summaryLine(summary)}
          </span>
          {summary.staleSinceCompile && (
            <span className="mt-1 block font-mono text-caption text-text-whisper">
              New source since last compile — recompile pending
            </span>
          )}
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-caption text-text-tertiary transition-transform duration-300 ease-spring ${
            expanded ? 'rotate-90' : ''
          } group-hover:text-text-primary`}
        >
          ›
        </span>
      </button>

      {expanded && (
        <ul className="mt-4 divide-y divide-border">
          {log.entries.map((entry: LogEntry, i: number) => (
            <li key={`${entry.ts}-${i}`}>
              <Link
                href={entry.targetHref}
                className="group/entry flex items-start gap-3 py-3 transition-colors duration-300 ease-spring hover:text-text-primary"
              >
                <span
                  aria-hidden
                  className="mt-[3px] w-4 shrink-0 text-center text-caption text-text-whisper group-hover/entry:text-accent transition-colors duration-300 ease-spring"
                >
                  {kindGlyph[entry.kind]}
                </span>
                <span className="flex-1 text-body text-text-secondary -tracking-[0.003em]">
                  {entry.label}
                </span>
                <span className="shrink-0 text-caption text-text-tertiary">
                  {formatWhen(entry.ts)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export { TopicLogFooter };
