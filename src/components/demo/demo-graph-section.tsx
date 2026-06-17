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

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { NodeDetailSheet } from '@/components/graph/node-detail-sheet';
import { scrubberStops, asOfVisibility } from '@/lib/graph/as-of';
import { tickPosition, nextPlayIndex } from '@/lib/graph/scrubber';
import { GraphFilterLegend, useCategoryFilter } from '@/components/graph/graph-filter-legend';
import { FLAG_PRESENTATION } from '@/lib/markers/flag-presentation';
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

// Every node is interactive now: health nodes open their detail; source /
// lab-report nodes open the shared source body (plan 2026-06-17-002). The
// canvas defaults to all-interactive, so no `nodeInteractive` predicate is
// passed — the category filter still makes a ghosted class non-interactive.

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
    // Source dots carry their document's capturedAt as firstSeenAt so the
    // time scrubber dims them in step with the data they cite (plan
    // 2026-06-15-001). Hub id === source id (synthesizeSourceNodes).
    const capturedByKey = new Map(wireSources.map((s) => [s.id, s.capturedAt]));
    const hubNodes = synthesizeSourceNodes(wireSources, 'demo', scoreCeiling).map((hub) => {
      const seen = capturedByKey.get(hub.id);
      // Conditional spread (not `firstSeenAt: seen`) so a miss omits the key
      // entirely, matching nodeToWire's additive "absent → always present".
      return seen ? { ...hub, firstSeenAt: seen } : hub;
    });
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

  // Time scrubber (plan 2026-06-15-001): the sorted distinct evidence dates
  // the graph grew through. Defaults to the latest stop, so the page loads as
  // the full graph (today's view); dragging back ghosts not-yet-known nodes.
  const stops = useMemo(() => scrubberStops(canvasNodes), [canvasNodes]);
  const [stopIndex, setStopIndex] = useState(() => Math.max(0, stops.length - 1));
  // Clamp once: if `stops` ever shrinks below a persisted index, every read
  // (epoch + labels + slider value) stays in range — no `undefined` reaching
  // formatStop. Single source instead of a per-read `?? fallback`.
  const activeIndex = stops.length > 0 ? Math.min(stopIndex, stops.length - 1) : 0;
  const asOfEpoch = stops.length > 0 ? stops[activeIndex] : null;
  const formatStop = (epoch: number) => format(new Date(epoch), 'MMM yyyy');

  // Play mode (plan 2026-06-16-001): auto-advance through the stops so the
  // record builds itself. Each step ~ the eased transition + a dwell. Stops at
  // the end; pressing play from the end restarts from the first stop.
  const [playing, setPlaying] = useState(false);
  // Live index for the interval to read (deps exclude stopIndex so the timer
  // isn't recreated every step) — avoids a stale closure AND keeps setState out
  // of an updater function.
  const stopIndexRef = useRef(activeIndex);
  stopIndexRef.current = activeIndex;
  useEffect(() => {
    if (!playing) return;
    const STEP_MS = 1100; // ≈ SCRUB_DURATION (0.55s) + dwell
    const id = setInterval(() => {
      const next = nextPlayIndex(stopIndexRef.current, stops.length);
      if (next == null) setPlaying(false); // reached the end
      else setStopIndex(next);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [playing, stops.length]);

  const togglePlay = useCallback(() => {
    if (!playing && activeIndex >= stops.length - 1) setStopIndex(0); // restart from start
    setPlaying((p) => !p);
  }, [playing, activeIndex, stops.length]);

  // Category filter (plan 2026-06-17-001) — shared hook with the authed graph,
  // so the demo and `/record?mode=map` can't drift. Empty by default → every
  // class shown (today's render); a hidden class fades to the canvas ghost floor.
  const { hiddenClasses, toggle: handleToggleClass, nodeGhosted } = useCategoryFilter();

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
  // O(1) lookup over the FULL canvas node set (health nodes + synthesized
  // source hubs) — resolves a clicked source node and enriches a source's
  // grounded markers with their live value/flag.
  const nodeById = useMemo(
    () => new Map(canvasNodes.map((n) => [n.id, n])),
    [canvasNodes],
  );

  const openNode = useMemo<GraphNodeWire | null>(() => {
    if (!validatedEntity) return null;
    // Health nodes carry provenance; source / lab-report hubs aren't in
    // provenanceByNodeId, so fall back to the canvas node set — scoped to
    // source hubs so `?entity=<sourceKey>` stays valid past the deep-link guard
    // while a bogus key still clears.
    const healthNode = adapted.provenanceByNodeId.get(validatedEntity)?.node;
    if (healthNode) return healthNode;
    const hub = nodeById.get(validatedEntity);
    return hub && hub.type === 'source_document' ? hub : null;
  }, [adapted, validatedEntity, nodeById]);

  // When the open node is a source / lab report, assemble the shared
  // source-detail payload: its SourceView (chunks + identity) plus the live
  // grounded markers (value/flag) it established, looked up from the canvas set.
  const openSourceDetail = useMemo(() => {
    if (!openNode || openNode.type !== 'source_document') return undefined;
    const sourceView = adapted.sourceViewByKey.get(openNode.id);
    if (!sourceView) return undefined;
    const grounded = sourceView.referencedNodes
      .map((r) => nodeById.get(r.id))
      .filter((n): n is GraphNodeWire => Boolean(n));
    return { sourceView, grounded };
  }, [openNode, adapted, nodeById]);

  // If the viewer filters off the visual class of the node whose detail sheet
  // is open, close the sheet — otherwise the canvas would ghost + aria-hide a
  // node the open surface still describes (a conflicting aria-current /
  // aria-hidden state). Clearing `?entity=` releases the selection cleanly.
  useEffect(() => {
    if (openNode && nodeGhosted(openNode)) updateUrl(null);
  }, [openNode, nodeGhosted, updateUrl]);

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
      // Don't open a node the timeline hasn't reached yet: a scrubber-dimmed
      // (not-yet-captured) node shouldn't open its detail (plan 2026-06-17-002
      // R6). Filter ghosts are already non-interactive via the canvas dim
      // effect; the time-ghost only dims, so guard the click here.
      if (asOfVisibility(node.firstSeenAt, asOfEpoch) !== 'present') return;
      // Health nodes resolve via provenanceByNodeId; source / lab-report nodes
      // resolve via the canvas source hubs and render the shared source body.
      updateUrl(node.id);
    },
    [updateUrl, asOfEpoch],
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
        {/* Authority cue (plan 2026-06-16-003) — sets the performance-baseline,
            not-a-diagnosis frame before any marker is read. Verbatim CMO copy. */}
        <p className="mb-4 text-caption text-text-secondary leading-relaxed">
          Built from verified lab results, wearable trends and your intake. Flagged items are for
          tracking or clinician discussion, not diagnosis.
        </p>
        <PriorityCluster nodes={canvasNodes} asOfEpoch={asOfEpoch} />
        <GraphCanvas
          nodes={canvasNodes}
          edges={canvasEdges}
          width={720}
          height={480}
          onNodeClick={handleNodeClick}
          selectedNodeId={openNode?.id ?? null}
          nodeGhosted={nodeGhosted}
          asOfEpoch={asOfEpoch}
          className="w-full h-auto"
          ariaLabel={`Health graph — ${canvasNodes.length} nodes, ${canvasEdges.length} edges. Tap any node to see its sources.`}
        />
        {stops.length > 1 && (
          <div className="mt-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                The record over time
              </span>
              <span className="font-mono text-sm tabular-nums text-text-primary">
                as of {formatStop(stops[activeIndex])}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? 'Pause' : 'Play through the timeline'}
                aria-pressed={playing}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-[10px] text-text-secondary transition-colors hover:bg-surface-warm"
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <div className="relative flex-1">
                {/* Dated stop ticks under the thumb (decorative — the input is
                    the accessible control). Inset matches the thumb's travel. */}
                <div className="pointer-events-none absolute inset-x-[7px] top-1/2 -translate-y-1/2" aria-hidden>
                  {stops.map((s, i) => (
                    <span
                      key={s}
                      className={`absolute h-2 w-px -translate-x-1/2 ${
                        i === activeIndex ? 'bg-text-primary' : 'bg-text-tertiary/40'
                      }`}
                      style={{ left: `${tickPosition(s, stops[0], stops[stops.length - 1])}%` }}
                    />
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={stops.length - 1}
                  step={1}
                  value={activeIndex}
                  onChange={(e) => {
                    setStopIndex(Number(e.target.value));
                    setPlaying(false); // a manual drag takes over from autoplay
                  }}
                  aria-label="Show the record as of an earlier date"
                  aria-valuetext={`As of ${formatStop(stops[activeIndex])}`}
                  className="relative w-full cursor-pointer accent-text-primary"
                />
              </div>
            </div>
            <div className="mt-1 flex justify-between pl-10 font-mono text-[10px] text-text-tertiary">
              <span>{formatStop(stops[0])}</span>
              <span>{formatStop(stops[stops.length - 1])}</span>
            </div>
          </div>
        )}
        <p className="mt-3 text-caption text-text-tertiary">
          Tap a node to see what grounds it. Hover to highlight what it&apos;s connected to. Tap a
          legend chip to focus on a node type.
          {stops.length > 1 ? ' Drag the timeline — or press play — to watch the record build.' : ''}
        </p>
        <GraphFilterLegend
          hiddenClasses={hiddenClasses}
          onToggle={handleToggleClass}
          className="mt-4"
        />
      </section>

      <NodeDetailSheet
        node={openNode}
        onClose={handleSheetClose}
        // Source nodes render the shared source body; health nodes get the
        // hydrated provenance. (openProvenance is null for a source node anyway.)
        hydratedProvenance={openSourceDetail ? undefined : openProvenance}
        // Empty topics list — fixture has no compiled topic pages, so
        // suppressing the section avoids an unnecessary authed fetch.
        hydratedTopics={[]}
        sourceDetail={openSourceDetail}
        onOpenNode={updateUrl}
      />
    </>
  );
}

// The ONE priority cluster (plan 2026-06-16-003 R10) — "Cardiometabolic
// baseline" surfaced above the graph so the clinically-salient story isn't
// buried among equal nodes. A compact card, not a dashboard grid. Membership is
// CMO-declared (the cardiometabolic markers), not an inferred risk score.
// ponytail: members hardcoded for the one cluster; tag the fixture if a second appears.
const PRIORITY_CLUSTER_MEMBERS = ['bm-ldl', 'bm-apob'];

function PriorityCluster({
  nodes,
  asOfEpoch,
}: {
  nodes: readonly GraphNodeWire[];
  asOfEpoch: number | null;
}) {
  const members = PRIORITY_CLUSTER_MEMBERS.map((id) => nodes.find((n) => n.id === id)).filter(
    // Only members already measured as-of the scrubber date — so ApoB (first
    // captured in 2026) doesn't appear in the cluster while the canvas dims it
    // as not-yet-born (keeps the cluster honest with the timeline).
    (n): n is GraphNodeWire =>
      Boolean(n?.change) && asOfVisibility(n!.firstSeenAt, asOfEpoch) === 'present',
  );
  if (members.length === 0) return null;
  return (
    <div className="mb-4 rounded-card border border-border bg-surface/60 p-3.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
        Cardiometabolic baseline
      </p>
      <ul className="mt-2.5 space-y-2">
        {members.map((n) => {
          const c = n.change!;
          const flag = n.interpretation?.flag;
          return (
            <li key={n.id} className="flex items-baseline justify-between gap-3">
              <span className="text-caption text-text-primary">
                <span className="font-medium">{n.displayName}</span>{' '}
                <span className="font-mono text-text-secondary">
                  {c.afterValue} {c.unit}
                  {c.classification === 'new' ? ' · new baseline' : c.direction === 'up' ? ' ↑' : c.direction === 'down' ? ' ↓' : ''}
                </span>
              </span>
              {flag && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-text-tertiary">
                  {FLAG_PRESENTATION[flag].label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-caption text-text-tertiary leading-relaxed">
        Worth watching because one lipid marker has moved upward and a new particle marker has been
        captured — a tracking and clinician-discussion signal, not a diagnosis.
      </p>
    </div>
  );
}

