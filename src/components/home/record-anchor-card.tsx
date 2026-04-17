'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { RecordIndex } from '@/lib/record/types';
import { newestTopic } from './record-anchor-helpers';

export type RecordAnchorState =
  | { status: 'loading' }
  | { status: 'unauth' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; data: RecordIndex };

export function RecordAnchorCard({ state }: { state: RecordAnchorState }) {
  if (state.status === 'loading') {
    return (
      <Card variant="default" className="opacity-60">
        <div className="flex items-baseline gap-2.5 mb-2">
          <span className="font-mono text-label uppercase text-text-tertiary">·</span>
          <span className="text-label uppercase text-text-tertiary">Your record</span>
        </div>
        <p className="mt-2 text-body text-text-tertiary">Loading…</p>
      </Card>
    );
  }

  if (state.status === 'empty' || state.status === 'unauth' || state.status === 'error') {
    return (
      <Card variant="action" accentColor="sage">
        <div className="flex items-baseline gap-2.5 mb-2">
          <span className="font-mono text-label uppercase text-text-tertiary">·</span>
          <span className="text-label uppercase text-text-tertiary">Your record</span>
        </div>
        <p className="mt-2 text-body text-text-secondary leading-relaxed">
          Nothing yet — import your data to start building your record.
        </p>
        <Link
          href="/intake"
          className="mt-4 inline-flex items-center gap-1.5 text-caption text-accent font-medium group"
        >
          Import your data
          <span
            aria-hidden
            className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
        <p className="mt-3 text-caption text-text-tertiary">
          or{' '}
          <Link
            href="/r/demo-navigable-record"
            className="underline decoration-text-tertiary/40 underline-offset-2 hover:decoration-text-tertiary"
          >
            explore the demo record
          </Link>
        </p>
      </Card>
    );
  }

  const { data } = state;
  const newest = newestTopic(data);
  const nodeCount = data.graphSummary.nodeCount;
  const sourceCount = data.graphSummary.sourceCount;

  return (
    <Link href="/record" className="block">
      <Card variant="action" accentColor="sage" clickable>
        <div className="flex items-baseline gap-2.5 mb-2">
          <span className="font-mono text-label uppercase text-text-tertiary">·</span>
          <span className="text-label uppercase text-text-tertiary">Your record</span>
        </div>
        <div className="mt-2 flex items-baseline gap-4">
          <div>
            <p className="font-mono text-data text-accent">{nodeCount}</p>
            <p className="mt-0.5 text-caption text-text-tertiary">
              {nodeCount === 1 ? 'node' : 'nodes'}
            </p>
          </div>
          <div>
            <p className="font-mono text-data text-accent">{sourceCount}</p>
            <p className="mt-0.5 text-caption text-text-tertiary">
              {sourceCount === 1 ? 'source' : 'sources'}
            </p>
          </div>
        </div>
        {newest && (
          <p className="mt-3 text-caption text-text-tertiary">
            Last update: <span className="text-text-secondary">{newest.name}</span>
            {newest.when ? ` · ${newest.when}` : ''}
          </p>
        )}
        <p className="mt-4 inline-flex items-center gap-1.5 text-caption text-accent font-medium group">
          Open your record
          <span
            aria-hidden
            className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5"
          >
            →
          </span>
        </p>
      </Card>
    </Link>
  );
}
