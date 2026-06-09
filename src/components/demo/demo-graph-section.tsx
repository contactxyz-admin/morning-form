'use client';

/**
 * Public-demo graph section. Wraps the force-directed canvas + the
 * NodeDetailSheet so the parent /demo/record RSC can stay a server
 * component (no auth fetches, no session reads).
 *
 * Mobile (<768px) renders the canvas as `hidden md:block`. The detail
 * sheet sits outside the canvas section, so a mobile visitor following a
 * `?entity=` deep-link still gets the sheet — they just can't click new
 * nodes (there's no visible canvas to click).
 *
 * Selection state lives in the URL as `?entity=<nodeId>` so shared links
 * can deep-link to a specific node and browser back/forward toggles the
 * sheet. See
 * docs/plans/2026-05-16-001-feat-navigable-record-demo-plan.md (U5).
 */

import { useCallback, useEffect, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { NodeDetailSheet } from '@/components/graph/node-detail-sheet';
import { adaptDemoFixture, type AdaptedDemoFixture } from '@/lib/demo/graph-adapter';
import {
  referencedSourceDocumentIds,
  synthesizeSourceEdges,
  synthesizeSourceNodes,
} from '@/lib/record/canvas-synthesis';
import type { SourceDocumentWire } from '@/lib/record/types';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';
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

// Loose canonical-key shape — fixture nodeKeys are kebab/underscore tokens
// with prefixes like `cond-`, `biomarker-`, etc. Reject anything outside
// this set to keep crafted `?entity=` values from polluting browser
// history before the deep-link guard clears them.
const ENTITY_PATTERN = /^[A-Za-z0-9\-_.:]+$/;
const ENTITY_MAX_LEN = 200;

// Source-document pseudo-nodes have no detail surface on the public demo
// (no /record/source/[id] equivalent for fixtures), so they must not
// present as buttons — no role, no tab stop, no pointer cursor. They keep
// hover-dim and drag. Module-level so the predicate identity is stable.
const isNodeInteractive = (node: GraphNodeWire) => node.type !== 'source_document';

export function DemoGraphSection({ fixture }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Adapt once per fixture identity. The fixture is a constant, so
  // this memo will fire exactly once per page mount.
  const adapted = useMemo<AdaptedDemoFixture>(() => adaptDemoFixture(fixture), [fixture]);

  // Canvas-only source-document hub synthesis. The adapted graph carries
  // each SUPPORTS edge's `fromDocumentId` (= `DemoSource.sourceKey`), so
  // referencedSourceDocumentIds picks out which sources any edge actually
  // points at. We then synthesise a `source_document`-typed pseudo-node
  // per referenced source plus biomarker→source edges so the canvas reads
  // as a citation graph rather than an entity blob.
  //
  // Differs from src/components/record/vault-layout.tsx (authed /record)
  // in that we do NOT filter out SUPPORTS edges — the demo fixture's
  // SUPPORTS edges are real biomarker→condition lines, not the self-loops
  // the authed schema uses. Both edge sets coexist on the canvas.
  const canvasNodes = useMemo<GraphNodeWire[]>(() => {
    const referencedIds = referencedSourceDocumentIds(adapted.graph.edges);
    const wireSources: SourceDocumentWire[] = fixture.sources
      .filter((s) => referencedIds.has(s.sourceKey))
      .map((s) => ({
        id: s.sourceKey,
        kind: s.kind as SourceDocumentKind,
        capturedAt: s.capturedAt,
        createdAt: s.capturedAt,
      }));
    const scoreCeiling = adapted.graph.nodes.reduce(
      (max, n) => Math.max(max, n.score),
      0,
    );
    const hubNodes = synthesizeSourceNodes(wireSources, 'demo', scoreCeiling);
    return [...adapted.graph.nodes, ...hubNodes];
  }, [adapted, fixture]);

  const canvasEdges = useMemo<GraphEdgeWire[]>(() => {
    const graphNodeIds = new Set(adapted.graph.nodes.map((n) => n.id));
    const sourceIds = new Set(
      canvasNodes.filter((n) => n.type === 'source_document').map((n) => n.id),
    );
    const synthesised = synthesizeSourceEdges(adapted.graph.edges, graphNodeIds, sourceIds);
    return [...adapted.graph.edges, ...synthesised];
  }, [adapted, canvasNodes]);

  const rawEntity = searchParams.get('entity');
  const validatedEntity =
    rawEntity && rawEntity.length <= ENTITY_MAX_LEN && ENTITY_PATTERN.test(rawEntity)
      ? rawEntity
      : null;

  const updateUrl = useCallback(
    (nextEntity: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextEntity === null) params.delete('entity');
      else params.set('entity', nextEntity);
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname);
      });
    },
    [pathname, router, searchParams],
  );

  // Deep-link truncation guard: if `?entity=` is set but no node matches
  // (unknown key, validation-rejected, or stale link), clear the param so
  // the URL truthfully reflects what's selected. Borrowed from
  // src/components/record/vault-layout.tsx:106-110.
  const openNode = useMemo<GraphNodeWire | null>(() => {
    if (!validatedEntity) return null;
    return adapted.provenanceByNodeId.get(validatedEntity)?.node ?? null;
  }, [adapted, validatedEntity]);

  useEffect(() => {
    // Three clear-cases (use `!== null` instead of truthiness so the
    // empty-string case `?entity=` also triggers a clear — `&&` would
    // short-circuit on `''` and leave the dangling param in the URL):
    //   1. rawEntity is '' (empty value, key present) → clear
    //   2. rawEntity is non-empty but failed validation → clear
    //   3. validatedEntity passes but no matching node → clear
    if (rawEntity !== null && (!validatedEntity || !openNode)) {
      updateUrl(null);
    }
  }, [rawEntity, validatedEntity, openNode, updateUrl]);

  const handleNodeClick = useCallback(
    (node: GraphNodeWire) => {
      // Source-document pseudo-nodes (added in U6) aren't in
      // `adapted.provenanceByNodeId`. Opening the sheet for them would
      // resolve to null and trigger the deep-link guard to immediately
      // clear the URL — a visible flicker for no outcome. Belt-and-braces:
      // the canvas already withholds the click via `isNodeInteractive`.
      if (!isNodeInteractive(node)) return;
      updateUrl(node.id);
    },
    [updateUrl],
  );

  const handleSheetClose = useCallback(() => {
    updateUrl(null);
  }, [updateUrl]);

  const openProvenance = useMemo<ProvenanceResponse | undefined>(() => {
    if (!openNode) return undefined;
    const entry = adapted.provenanceByNodeId.get(openNode.id);
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
  }, [adapted, openNode]);

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
          nodes={canvasNodes}
          edges={canvasEdges}
          width={720}
          height={480}
          onNodeClick={handleNodeClick}
          selectedNodeId={openNode?.id ?? null}
          nodeInteractive={isNodeInteractive}
          className="w-full h-auto"
          ariaLabel={`Health graph — ${canvasNodes.length} nodes, ${canvasEdges.length} edges. Tap any node to see its sources.`}
        />
        <p className="mt-3 text-caption text-text-tertiary">
          Tap a node to see what grounds it. Hover to highlight what it&apos;s connected to.
        </p>
        <GraphLegend />
      </section>

      <NodeDetailSheet
        node={openNode}
        onClose={handleSheetClose}
        hydratedProvenance={openProvenance}
        // Empty topics list — fixture has no compiled topic pages, so
        // suppressing the section avoids an unnecessary authed fetch.
        hydratedTopics={[]}
      />
    </>
  );
}

/**
 * Compact 4-swatch legend explaining the canvas's visual-class colours.
 * Mirrors src/lib/graph/visual-encoding.ts → NODE_VISUAL_BY_CLASS so the
 * legend never drifts from the encoding. The class strings inlined here
 * also serve as a redundant signal to Tailwind's content scanner — they
 * survive even if a future refactor moves visual-encoding.ts outside
 * the scanned tree.
 */
function GraphLegend() {
  const items: Array<{ label: string; fill: string; stroke: string }> = [
    { label: 'Clinical', fill: 'fill-alert/15', stroke: 'stroke-alert/70' },
    { label: 'Biomarker', fill: 'fill-accent/20', stroke: 'stroke-accent' },
    { label: 'Intervention', fill: 'fill-positive/15', stroke: 'stroke-positive/80' },
    { label: 'Source', fill: 'fill-text-tertiary/10', stroke: 'stroke-text-tertiary/60' },
  ];
  return (
    <ul
      aria-label="Graph node legend"
      className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2"
    >
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary"
        >
          <svg
            aria-hidden
            viewBox="0 0 12 12"
            width={12}
            height={12}
            className="shrink-0"
          >
            <circle
              cx={6}
              cy={6}
              r={5}
              className={`${item.fill} ${item.stroke}`}
              strokeWidth={1.2}
            />
          </svg>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
