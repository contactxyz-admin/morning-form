'use client';

/**
 * Public-demo graph section. Wraps the force-directed canvas + the
 * NodeDetailSheet so the parent /demo/record RSC can stay a server
 * component (no auth fetches, no session reads).
 *
 * Mobile (<768px) renders nothing — the page already has the existing
 * specialty-surface text layout below. CSS gating (`hidden md:block`)
 * avoids the SSR/client hydration flash that `useMediaQuery` would
 * cause.
 */

import { useMemo, useState } from 'react';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { NodeDetailSheet } from '@/components/graph/node-detail-sheet';
import { adaptDemoFixture, type AdaptedDemoFixture } from '@/lib/demo/graph-adapter';
import type { GraphNodeWire } from '@/types/graph';
import type { DemoRecordFixture } from '../../../prisma/fixtures/demo-navigable-record';
import type { SourceDocumentKind } from '@/lib/graph/types';

interface ProvenanceItemWire {
  chunkId: string;
  documentId: string;
  documentKind: SourceDocumentKind;
  text: string;
  offsetStart: number;
  offsetEnd: number;
  pageNumber: number | null;
  capturedAt: string;
}

interface ProvenanceResponse {
  node: GraphNodeWire;
  provenance: ProvenanceItemWire[];
}

interface Props {
  /** Raw demo fixture, passed by the RSC parent. Adapted client-side. */
  readonly fixture: DemoRecordFixture;
}

export function DemoGraphSection({ fixture }: Props) {
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);

  // Adapt once per fixture identity. The fixture is a constant, so
  // this memo will fire exactly once per page mount.
  const adapted = useMemo<AdaptedDemoFixture>(() => adaptDemoFixture(fixture), [fixture]);

  const openProvenance = useMemo<ProvenanceResponse | undefined>(() => {
    if (!openNodeId) return undefined;
    const entry = adapted.provenanceByNodeId.get(openNodeId);
    if (!entry) return undefined;
    return {
      node: entry.node,
      provenance: entry.chunks.map((chunk) => {
        const source = entry.sources.find((s) =>
          s.chunks.some((c) => c.chunkKey === chunk.chunkKey),
        );
        return {
          chunkId: chunk.chunkKey,
          documentId: source?.sourceKey ?? 'demo-source',
          documentKind: (source?.kind ?? 'lab_pdf') as SourceDocumentKind,
          text: chunk.text,
          offsetStart: chunk.offsetStart,
          offsetEnd: chunk.offsetEnd,
          pageNumber: chunk.pageNumber,
          capturedAt: source?.capturedAt ?? '',
        };
      }),
    };
  }, [adapted, openNodeId]);

  const openNode = useMemo<GraphNodeWire | null>(() => {
    if (!openNodeId) return null;
    return adapted.provenanceByNodeId.get(openNodeId)?.node ?? null;
  }, [adapted, openNodeId]);

  return (
    <>
      <section
        aria-label="Health graph"
        // Hidden on mobile via CSS — no canvas rendered at all on
        // small viewports. SSR-safe: the markup is present in the
        // initial HTML, just display:none until md.
        className="hidden md:block mt-12 rounded-card border border-border bg-surface-warm/40 p-4"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-3">
          The graph — interactive
        </p>
        <GraphCanvas
          nodes={adapted.graph.nodes}
          edges={adapted.graph.edges}
          width={720}
          height={480}
          onNodeClick={(node) => setOpenNodeId(node.id)}
          className="w-full h-auto"
          ariaLabel={`Health graph — ${adapted.graph.nodes.length} nodes, ${adapted.graph.edges.length} edges. Tap any node to see its sources.`}
        />
        <p className="mt-3 text-caption text-text-tertiary">
          Tap a node to see what grounds it. Hover to highlight what it&apos;s connected to.
        </p>
      </section>

      <NodeDetailSheet
        node={openNode}
        onClose={() => setOpenNodeId(null)}
        hydratedProvenance={openProvenance}
        // Empty topics list — fixture has no compiled topic pages, so
        // suppressing the section avoids an unnecessary authed fetch.
        hydratedTopics={[]}
      />
    </>
  );
}
