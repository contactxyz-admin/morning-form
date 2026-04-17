import Link from 'next/link';
import { SectionLabel } from '@/components/ui/section-label';
import type { LogEntry, LogEntryKind } from '@/lib/record/types';

interface ActivityFeedProps {
  entries: LogEntry[];
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

function ActivityFeed({ entries }: ActivityFeedProps) {
  if (entries.length === 0) {
    return (
      <div>
        <SectionLabel className="text-text-whisper">Recent activity</SectionLabel>
        <p className="mt-4 text-body text-text-tertiary">
          Nothing yet — add a source and the record will start to fill in.
        </p>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel className="text-text-whisper">Recent activity</SectionLabel>
      <ul className="mt-4 divide-y divide-border">
        {entries.map((entry, i) => (
          <li key={`${entry.ts}-${i}`}>
            <Link
              href={entry.targetHref}
              className="group flex items-start gap-3 py-3 transition-colors duration-300 ease-spring hover:text-text-primary"
            >
              <span
                aria-hidden
                className="mt-[3px] w-4 shrink-0 text-center text-caption text-text-whisper group-hover:text-accent transition-colors duration-300 ease-spring"
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
    </div>
  );
}

export { ActivityFeed };
