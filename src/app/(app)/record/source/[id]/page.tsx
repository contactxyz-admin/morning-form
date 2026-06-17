'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SectionLabel } from '@/components/ui/section-label';
import { MeshGradient } from '@/components/ui/mesh-gradient';
import { SourceDetailBody } from '@/components/record/source-detail-body';
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

      {/*
        Shared source body (plan 2026-06-17-002) — the same "what this report
        established" + verbatim-excerpts presentation the demo graph sheet shows.
        ponytail: authed grounded markers are name-only (the source API doesn't
        carry per-node change/interpretation); enrich the route select to light
        up value/flag here too. Drill-down is omitted (referencedNodes lack
        canonicalKey) — add when the payload carries it.
      */}
      <div className="mt-12 rise">
        <SourceDetailBody
          sourceView={data}
          grounded={data.referencedNodes.map((n) => ({ id: n.id, displayName: n.displayName }))}
        />
      </div>
    </>
  );
}
