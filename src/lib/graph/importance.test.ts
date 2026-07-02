import { describe, expect, it } from 'vitest';
import { computeImportance } from './importance';
import type { GraphEdgeRecord, GraphNodeRecord } from './types';

function makeNode(overrides: Partial<GraphNodeRecord> = {}): GraphNodeRecord {
  return {
    id: overrides.id ?? 'n1',
    userId: 'u1',
    type: 'biomarker',
    canonicalKey: 'k',
    displayName: 'K',
    attributes: {},
    confidence: 1,
    promoted: overrides.promoted ?? false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeEdge(overrides: Partial<GraphEdgeRecord> & { from: string; to: string }): GraphEdgeRecord {
  return {
    id: `${overrides.from}-${overrides.to}`,
    userId: 'u1',
    type: overrides.type ?? 'ASSOCIATED_WITH',
    fromNodeId: overrides.from,
    toNodeId: overrides.to,
    fromChunkId: null,
    fromDocumentId: null,
    weight: 1,
    metadata: {},
    createdAt: new Date(),
  };
}

describe('computeImportance', () => {
  it('orphan node with no signals lands in tier 3', () => {
    const node = makeNode({ id: 'n1' });
    const result = computeImportance({ nodes: [node], edges: [] });
    const score = result.get('n1')!;
    expect(score.score).toBe(0);
    expect(score.tier).toBe(3);
  });

  it('promoted alone gives +3 and tier 2', () => {
    const node = makeNode({ id: 'n1', promoted: true });
    const result = computeImportance({ nodes: [node], edges: [] });
    const score = result.get('n1')!;
    expect(score.components.promoted).toBe(3);
    expect(score.score).toBe(3);
    expect(score.tier).toBe(2);
  });

  it('a changed-since-last-panel node gets +2 and clears into tier 1', () => {
    const node = makeNode({ id: 'n1', promoted: true });
    const result = computeImportance({
      nodes: [node],
      edges: [],
      changedNodeIds: new Set(['n1']),
    });
    const score = result.get('n1')!;
    expect(score.components.change).toBe(2);
    // promoted (3) + change (2) = 5 ≥ 4 → tier 1, so a moved marker survives
    // the node cap and reads as prominent.
    expect(score.score).toBe(5);
    expect(score.tier).toBe(1);
  });

  it('change lift applies only to listed ids; others get 0', () => {
    const a = makeNode({ id: 'a' });
    const b = makeNode({ id: 'b' });
    const result = computeImportance({
      nodes: [a, b],
      edges: [],
      changedNodeIds: new Set(['a']),
    });
    expect(result.get('a')!.components.change).toBe(2);
    expect(result.get('b')!.components.change).toBe(0);
  });

  it('promoted + high degree reaches tier 1', () => {
    const hub = makeNode({ id: 'hub', promoted: true });
    const others = Array.from({ length: 5 }, (_, i) => makeNode({ id: `n${i}` }));
    const edges = others.map((n) => makeEdge({ from: 'hub', to: n.id }));
    const result = computeImportance({ nodes: [hub, ...others], edges });
    const hubScore = result.get('hub')!;
    expect(hubScore.components.promoted).toBe(3);
    expect(hubScore.components.degree).toBeGreaterThan(1);
    expect(hubScore.tier).toBe(1);
  });

  it('SUPPORTS edges do not inflate degree', () => {
    const node = makeNode({ id: 'n1' });
    const chunkNode = makeNode({ id: 'doc1', type: 'source_document' });
    const edges = [
      makeEdge({ from: 'doc1', to: 'n1', type: 'SUPPORTS' }),
      makeEdge({ from: 'doc1', to: 'n1', type: 'SUPPORTS' }),
      makeEdge({ from: 'doc1', to: 'n1', type: 'SUPPORTS' }),
    ];
    const result = computeImportance({ nodes: [node, chunkNode], edges });
    expect(result.get('n1')!.components.degree).toBe(0);
  });

  it('recent supporting chunk adds +1', () => {
    const node = makeNode({ id: 'n1' });
    const asOf = new Date('2026-04-17');
    const recencyMap = new Map<string, Date | null>([['n1', new Date('2026-04-10')]]);
    const result = computeImportance({
      nodes: [node],
      edges: [],
      recencyMap,
      asOf,
    });
    expect(result.get('n1')!.components.recency).toBe(1);
    expect(result.get('n1')!.tier).toBe(3); // 0 + 0 + 1 = 1
  });

  it('old supporting chunk does not add recency', () => {
    const node = makeNode({ id: 'n1' });
    const asOf = new Date('2026-04-17');
    const recencyMap = new Map<string, Date | null>([['n1', new Date('2025-01-01')]]);
    const result = computeImportance({
      nodes: [node],
      edges: [],
      recencyMap,
      asOf,
    });
    expect(result.get('n1')!.components.recency).toBe(0);
  });

  it('degree score is capped at 2', () => {
    const hub = makeNode({ id: 'hub' });
    const others = Array.from({ length: 100 }, (_, i) => makeNode({ id: `n${i}` }));
    const edges = others.map((n) => makeEdge({ from: 'hub', to: n.id }));
    const result = computeImportance({ nodes: [hub, ...others], edges });
    expect(result.get('hub')!.components.degree).toBe(2);
  });

  it('a fresh node within the recency window has no staleness penalty', () => {
    const node = makeNode({ id: 'n1' });
    const asOf = new Date('2026-04-17');
    const recencyMap = new Map<string, Date | null>([['n1', new Date('2026-04-10')]]); // 7 days
    const r = computeImportance({ nodes: [node], edges: [], recencyMap, asOf }).get('n1')!;
    expect(r.components.staleness).toBe(0);
    expect(r.components.recency).toBe(1);
  });

  it('a node with no evidence date carries no staleness penalty', () => {
    const node = makeNode({ id: 'n1', promoted: true });
    const r = computeImportance({ nodes: [node], edges: [] }).get('n1')!;
    expect(r.components.staleness).toBe(0);
    expect(r.score).toBe(3); // promoted only — unchanged by B4
  });

  it('a node whose newest evidence aged past the window gets a bounded staleness penalty', () => {
    const node = makeNode({ id: 'n1' });
    const asOf = new Date('2026-04-17');
    const recencyMap = new Map<string, Date | null>([['n1', new Date('2025-01-01')]]); // ~471 days
    const r = computeImportance({ nodes: [node], edges: [], recencyMap, asOf }).get('n1')!;
    expect(r.components.recency).toBe(0);
    expect(r.components.staleness).toBeLessThan(0);
    expect(r.components.staleness).toBeGreaterThanOrEqual(-1);
  });

  it('penalises staleness, not low authored confidence', () => {
    const asOf = new Date('2026-04-17');
    // A: full confidence but a year stale. B: low confidence, one day past the window.
    const a = makeNode({ id: 'a', confidence: 1 });
    const b = makeNode({ id: 'b', confidence: 0.3 });
    const recencyMap = new Map<string, Date | null>([
      ['a', new Date('2025-04-17')], // ~365 days
      ['b', new Date('2026-03-17')], // ~31 days
    ]);
    const res = computeImportance({ nodes: [a, b], edges: [], recencyMap, asOf });
    const sa = res.get('a')!.components.staleness;
    const sb = res.get('b')!.components.staleness;
    expect(sa).toBeLessThan(sb); // the stale node is penalised MORE (more negative)
    expect(sb).toBeGreaterThan(-0.05); // barely-past-window node barely penalised despite low confidence
  });

  it('staleness demotes a stale, moderately-connected node out of tier 2', () => {
    const hub = makeNode({ id: 'hub' });
    const others = Array.from({ length: 5 }, (_, i) => makeNode({ id: `o${i}` }));
    const edges = others.map((o) => makeEdge({ from: 'hub', to: o.id })); // degree → +2
    const asOf = new Date('2026-04-17');
    const recencyMap = new Map<string, Date | null>([['hub', new Date('2024-06-01')]]); // very stale
    const r = computeImportance({ nodes: [hub, ...others], edges, recencyMap, asOf }).get('hub')!;
    expect(r.components.degree).toBe(2); // would be tier 2 on its own
    expect(r.components.staleness).toBeLessThan(0);
    expect(r.tier).toBe(3); // 2 + staleness(<0) < 2 → demoted
  });

  it('a node earning all three signals is tier 1', () => {
    const node = makeNode({ id: 'n1', promoted: true });
    const others = Array.from({ length: 3 }, (_, i) => makeNode({ id: `o${i}` }));
    const edges = others.map((o) => makeEdge({ from: 'n1', to: o.id }));
    const recencyMap = new Map<string, Date | null>([['n1', new Date('2026-04-15')]]);
    const result = computeImportance({
      nodes: [node, ...others],
      edges,
      recencyMap,
      asOf: new Date('2026-04-17'),
    });
    const r = result.get('n1')!;
    expect(r.components.promoted).toBe(3);
    expect(r.components.recency).toBe(1);
    expect(r.tier).toBe(1);
  });
});
