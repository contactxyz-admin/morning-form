import { describe, expect, it } from 'vitest';
import type { GraphEdgeWire, GraphNodeWire } from '@/types/graph';
import { MIN_EDGE_DENSITY, isRelationalEdge, shouldShowCanvas } from './canvas-gate';

function node(id: string): GraphNodeWire {
  return {
    id,
    userId: 'test',
    type: 'biomarker',
    canonicalKey: id,
    displayName: id,
    attributes: {},
    confidence: 1,
    promoted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tier: 2,
    score: 0.5,
  };
}

function edge(from: string, to: string, type: GraphEdgeWire['type']): GraphEdgeWire {
  return {
    id: `${from}__${type}__${to}`,
    userId: 'test',
    type,
    fromNodeId: from,
    toNodeId: to,
    fromChunkId: null,
    fromDocumentId: null,
    weight: 1,
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('isRelationalEdge', () => {
  it('returns false for SUPPORTS (provenance-only)', () => {
    expect(isRelationalEdge({ type: 'SUPPORTS' })).toBe(false);
  });

  it('returns true for every other edge type', () => {
    for (const t of ['ASSOCIATED_WITH', 'CAUSES', 'CONTRADICTS', 'TEMPORAL_SUCCEEDS', 'INSTANCE_OF', 'OUTCOME_CHANGED'] as const) {
      expect(isRelationalEdge({ type: t })).toBe(true);
    }
  });
});

describe('shouldShowCanvas', () => {
  it('returns false on mobile regardless of density', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('a', 'b', 'CAUSES'), edge('b', 'a', 'CAUSES')];
    expect(shouldShowCanvas(nodes, edges, false)).toBe(false);
  });

  it('returns false when there are zero nodes', () => {
    expect(shouldShowCanvas([], [], true)).toBe(false);
  });

  it('returns true above the density floor', () => {
    // 2 nodes, 1 non-SUPPORTS edge → density 0.5 ≥ 0.4 → show
    const nodes = [node('a'), node('b')];
    const edges = [edge('a', 'b', 'CAUSES')];
    expect(shouldShowCanvas(nodes, edges, true)).toBe(true);
  });

  it('returns false below the density floor', () => {
    // 10 nodes, 3 non-SUPPORTS edges → density 0.3 < 0.4 → hide
    const nodes = Array.from({ length: 10 }, (_, i) => node(`n${i}`));
    const edges = [
      edge('n0', 'n1', 'CAUSES'),
      edge('n1', 'n2', 'CAUSES'),
      edge('n2', 'n3', 'CAUSES'),
    ];
    expect(shouldShowCanvas(nodes, edges, true)).toBe(false);
  });

  it('returns true at exactly the density floor (>= boundary)', () => {
    // 5 nodes, 2 non-SUPPORTS edges → density 0.4 → show (>= boundary)
    const nodes = Array.from({ length: 5 }, (_, i) => node(`n${i}`));
    const edges = [edge('n0', 'n1', 'CAUSES'), edge('n2', 'n3', 'CAUSES')];
    expect(shouldShowCanvas(nodes, edges, true)).toBe(true);
  });

  it('excludes SUPPORTS edges from the density calc', () => {
    // 10 nodes; 10 SUPPORTS (one per node) plus 2 non-SUPPORTS.
    // Naive density would be 12/10 = 1.2 → above floor; correct
    // density is 2/10 = 0.2 → below floor → hide.
    const nodes = Array.from({ length: 10 }, (_, i) => node(`n${i}`));
    const edges = [
      ...Array.from({ length: 10 }, (_, i) => edge(`n${i}`, 'src', 'SUPPORTS')),
      edge('n0', 'n1', 'CAUSES'),
      edge('n2', 'n3', 'CAUSES'),
    ];
    expect(shouldShowCanvas(nodes, edges, true)).toBe(false);
  });

  it('returns false when zero non-SUPPORTS edges exist', () => {
    // Pure-provenance graph: every edge is SUPPORTS. Particle cloud — hide.
    const nodes = Array.from({ length: 10 }, (_, i) => node(`n${i}`));
    const edges = Array.from({ length: 10 }, (_, i) => edge(`n${i}`, 'src', 'SUPPORTS'));
    expect(shouldShowCanvas(nodes, edges, true)).toBe(false);
  });
});

describe('MIN_EDGE_DENSITY', () => {
  it('is 0.4', () => {
    // Pinned constant — changing this is a UX-policy decision, not a refactor.
    expect(MIN_EDGE_DENSITY).toBe(0.4);
  });
});
