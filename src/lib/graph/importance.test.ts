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
