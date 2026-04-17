'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SectionLabel } from '@/components/ui/section-label';
import { ThreeTierSection } from '@/components/topic/three-tier-section';
import { GPPrepCard } from '@/components/topic/gp-prep-card';
import { NodeDetailSheet } from '@/components/graph/node-detail-sheet';
import { ShareDialog } from '@/components/share/share-dialog';
import type { TopicCompiledOutput } from '@/lib/topics/types';
import type { GraphNodeWire } from '@/types/graph';

interface TopicResponse {
  topicKey: string;
  displayName: string;
  status: 'full' | 'stub' | 'error';
  graphRevisionHash: string;
  cached: boolean;
  output: TopicCompiledOutput | null;
  errorMessage?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'unauth' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TopicResponse };

export default function TopicPage() {
  const params = useParams<{ topicKey: string }>();
  const topicKey = params?.topicKey;
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [citedNode, setCitedNode] = useState<GraphNodeWire | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!topicKey) return;
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch(`/api/topics/${encodeURIComponent(topicKey)}`, {
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
        const json = (await res.json()) as TopicResponse;
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
  }, [topicKey]);

  const handleCitationClick = async (nodeId: string) => {
    try {
      const res = await fetch(
        `/api/graph/nodes/${encodeURIComponent(nodeId)}/provenance`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const json = await res.json();
      setCitedNode(json.node as GraphNodeWire);
    } catch {
      /* swallow — citation click is best-effort */
    }
  };

  return (
    <div className="px-5 pt-6 grain-page pb-24">
      {/* Back + kicker */}
      <div className="flex items-center justify-between mb-8">
        <Link
          href="/graph"
          className="flex items-center gap-2 text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
          aria-label="Back to graph"
        >
          <Icon name="back" size="sm" />
          <span className="text-caption">Graph</span>
        </Link>
        <div className="flex items-center gap-3">
          {state.status === 'ready' && state.data.status === 'full' && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShareOpen(true)}
            >
              Share
            </Button>
          )}
          <SectionLabel>Topic</SectionLabel>
        </div>
      </div>

      {state.status === 'loading' && (
        <Card variant="sunken" className="opacity-60 py-16 text-center">
          <p className="font-display font-light text-heading text-text-primary">
            Compiling your topic…
          </p>
          <p className="mt-2 text-caption text-text-tertiary">
            This can take a few seconds on first view.
          </p>
        </Card>
      )}

      {state.status === 'unauth' && (
        <Card variant="paper">
          <p className="text-body text-text-secondary">Sign in to view this topic.</p>
        </Card>
      )}

      {state.status === 'not-found' && (
        <Card variant="paper">
          <p className="text-body text-text-secondary">
            That topic doesn&apos;t exist yet.
          </p>
        </Card>
      )}

      {state.status === 'error' && (
        <Card variant="paper" accentColor="alert">
          <p className="text-body text-text-secondary">
            Something went wrong loading this topic.
          </p>
          <p className="mt-2 font-mono text-caption text-text-tertiary">
            {state.message}
          </p>
        </Card>
      )}

      {state.status === 'ready' && state.data.status === 'stub' && (
        <TopicStub displayName={state.data.displayName} />
      )}

      {state.status === 'ready' && state.data.status === 'error' && (
        <Card variant="paper" accentColor="alert">
          <p className="text-body text-text-secondary">
            This topic couldn&apos;t be compiled from the current graph.
          </p>
          {state.data.errorMessage && (
            <p className="mt-2 font-mono text-caption text-text-tertiary">
              {state.data.errorMessage}
            </p>
          )}
        </Card>
      )}

      {state.status === 'ready' && state.data.status === 'full' && state.data.output && (
        <TopicBody data={state.data} onCitationClick={handleCitationClick} />
      )}

      <NodeDetailSheet node={citedNode} onClose={() => setCitedNode(null)} />

      {topicKey && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          scope={{ kind: 'topic', topicKey }}
          defaultLabel={
            state.status === 'ready' ? state.data.displayName : undefined
          }
        />
      )}
    </div>
  );
}

function TopicStub({ displayName }: { displayName: string }) {
  return (
    <Card variant="paper" className="py-12 text-center">
      <SectionLabel>{displayName}</SectionLabel>
      <p className="mt-6 font-display font-light text-heading text-text-primary -tracking-[0.02em]">
        Not enough to go on yet.
      </p>
      <p className="mt-3 text-body text-text-secondary max-w-sm mx-auto leading-relaxed">
        Add a lab result or a relevant check-in and we&apos;ll compile this
        page from what we find.
      </p>
    </Card>
  );
}

function TopicBody({
  data,
  onCitationClick,
}: {
  data: TopicResponse;
  onCitationClick: (nodeId: string) => void;
}) {
  const output = data.output!;
  return (
    <>
      <header className="rise">
        <SectionLabel>{data.displayName}</SectionLabel>
        <h1 className="mt-4 font-display font-light text-display-xl sm:text-display-2xl text-text-primary -tracking-[0.045em] leading-[0.98]">
          {output.understanding.heading}
        </h1>
      </header>

      <div className="mt-14 space-y-14 stagger">
        <ThreeTierSection
          ordinal="01"
          kicker="Understanding"
          accent="teal"
          section={output.understanding}
          onCitationClick={onCitationClick}
        />
        <ThreeTierSection
          ordinal="02"
          kicker="What you can do now"
          accent="sage"
          section={output.whatYouCanDoNow}
          onCitationClick={onCitationClick}
        />
        <ThreeTierSection
          ordinal="03"
          kicker="Discuss with a clinician"
          accent="amber"
          section={output.discussWithClinician}
          onCitationClick={onCitationClick}
        />
      </div>

      <GPPrepCard gpPrep={output.gpPrep} />
    </>
  );
}
