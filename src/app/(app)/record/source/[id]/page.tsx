'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SectionLabel } from '@/components/ui/section-label';
import { MeshGradient } from '@/components/ui/mesh-gradient';
import type { SourceView } from '@/lib/record/source-view';

type LoadState =
  | { status: 'loading' }
  | { status: 'unauth' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SourceView };

export default function SourceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/record/source/${encodeURIComponent(id)}`, {
          cache: 'no-store',
        });
        if (res.status === 401) {
          if (!cancelled) setState({ status: 'unauth' });
          return;
        }
        if (res.status === 404) {
          if (!cancelled) setState({ status: 'not-found' });
          return;
        }
        if (!res.ok) {
          if (!cancelled) setState({ status: 'error', message: `HTTP ${res.status}` });
          return;
        }
        const json = (await res.json()) as SourceView;
        if (!cancelled) setState({ status: 'ready', data: json });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-record-grid">
      <div className="px-5 pt-6 pb-16 grain-page">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/record"
            className="flex items-center gap-2 text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
            aria-label="Back to record"
          >
            <Icon name="back" size="sm" />
            <span className="text-caption">Record</span>
          </Link>
          <SectionLabel className="text-text-whisper">Source</SectionLabel>
        </div>

        {state.status === 'loading' && (
          <Card variant="sunken" className="opacity-60 py-16 text-center">
            <p className="font-display font-light text-heading text-text-primary">
              Opening source…
            </p>
          </Card>
        )}

        {state.status === 'unauth' && (
          <Card variant="paper">
            <p className="text-body text-text-secondary">Sign in to view this source.</p>
          </Card>
        )}

        {state.status === 'not-found' && (
          <Card variant="paper">
            <p className="text-body text-text-secondary">
              That source isn&rsquo;t in your record.
            </p>
          </Card>
        )}

        {state.status === 'error' && (
          <Card variant="paper" accentColor="alert">
            <p className="text-body text-text-secondary">
              Something went wrong loading this source.
            </p>
            <p className="mt-2 font-mono text-caption text-text-tertiary">{state.message}</p>
          </Card>
        )}

        {state.status === 'ready' && <SourceBody data={state.data} />}
      </div>
    </div>
  );
}

function SourceBody({ data }: { data: SourceView }) {
  const capturedLabel = new Date(data.capturedAt).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <>
      <header className="rise">
        <MeshGradient
          seed={data.id}
          variant={data.kind}
          className="h-40 w-full rounded-card border border-border/60"
        />
        <div className="mt-6 flex items-baseline gap-3">
          <SectionLabel className="text-text-whisper">{data.kindLabel}</SectionLabel>
          <span className="font-mono text-label uppercase text-text-tertiary">
            {capturedLabel}
          </span>
        </div>
        <h1 className="mt-4 font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.02]">
          {data.displayTitle}
        </h1>
      </header>

      <div className="mt-12 stagger space-y-12">
        <section>
          <SectionLabel className="text-text-whisper">Extracted nodes</SectionLabel>
          {data.referencedNodes.length === 0 ? (
            <p className="mt-4 text-body text-text-tertiary">
              Nothing has been pulled into the graph from this source yet.
            </p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-2">
              {data.referencedNodes.map((node) => (
                <li
                  key={node.id}
                  className="inline-flex items-center gap-2 rounded-chip border border-border bg-surface px-3 py-1.5"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                    {node.type}
                  </span>
                  <span className="text-caption text-text-secondary">{node.displayName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionLabel className="text-text-whisper">Content</SectionLabel>
          {data.chunks.length === 0 ? (
            <p className="mt-4 text-body text-text-tertiary">
              This source doesn&rsquo;t have any extractable text.
            </p>
          ) : (
            <div className="mt-4 space-y-6">
              {data.chunks.map((chunk) => (
                <article
                  key={chunk.id}
                  className="border-t border-border/60 pt-4 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                      {String(chunk.index + 1).padStart(2, '0')}
                    </span>
                    {chunk.pageNumber !== null && (
                      <span className="text-caption text-text-tertiary">
                        p.{chunk.pageNumber}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-body text-text-secondary leading-relaxed">
                    {chunk.text}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
