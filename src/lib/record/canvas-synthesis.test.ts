import { describe, expect, it } from 'vitest';
import type { GraphEdgeWire } from '@/types/graph';
import {
  referencedSourceDocumentIds,
  synthesizeSourceEdges,
  synthesizeSourceNodes,
} from './canvas-synthesis';
import type { SourceDocumentWire } from './types';

const source = (
  id: string,
  kind: SourceDocumentWire['kind'] = 'lab_pdf',
  capturedAt = '2026-04-09T10:00:00.000Z',
  createdAt = '2026-04-09T11:00:00.000Z',
): SourceDocumentWire => ({ id, kind, capturedAt, createdAt });

const edge = (
  partial: Partial<GraphEdgeWire> & {
    fromNodeId: string;
    toNodeId: string;
    type: GraphEdgeWire['type'];
  },
): GraphEdgeWire => ({
  id: `${partial.fromNodeId}-${partial.type}-${partial.toNodeId}`,
  userId: 'u',
  fromChunkId: null,
  fromDocumentId: null,
  weight: 1,
  metadata: {},
  createdAt: '2026-04-09T10:00:00.000Z',
  ...partial,
});

describe('synthesizeSourceNodes', () => {
  it('builds a GraphNodeWire-shaped entry per source, with tier-1 hub posture', () => {
    const nodes = synthesizeSourceNodes(
      [source('s1', 'lab_pdf'), source('s2', 'gp_letter')],
      'u-123',
      42,
    );

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual({
      id: 's1',
      userId: 'u-123',
      type: 'source_document',
      canonicalKey: 's1',
      displayName: expect.stringMatching(/^Lab report · /),
      attributes: {},
      confidence: 1,
      promoted: false,
      createdAt: '2026-04-09T11:00:00.000Z',
      updatedAt: '2026-04-09T10:00:00.000Z',
      tier: 1,
      score: 43,
    });
    // Score above the biomarker ceiling so any future canvas-side cap keeps source-doc hubs in.
    expect(nodes.every((n) => n.score === 43)).toBe(true);
    // Every source-doc node is tier 1 (largest radius, always-on label).
    expect(nodes.every((n) => n.tier === 1)).toBe(true);
  });

  it('renders unknown kinds via the snake_case fallback rather than throwing', () => {
    // `kindLabel` decodes via the enum; unknown kinds fall through to a
    // simple `_` → space rewrite. The test pins the failure mode so legacy
    // DB strings don't crash the canvas.
    const nodes = synthesizeSourceNodes(
      [{ ...source('s1'), kind: 'legacy_kind_not_in_enum' as never }],
      'u-1',
      0,
    );
    expect(nodes[0].displayName).toMatch(/^legacy kind not in enum · /);
  });

  it('returns an empty array for an empty sources input', () => {
    expect(synthesizeSourceNodes([], 'u-1', 0)).toEqual([]);
  });
});

describe('referencedSourceDocumentIds', () => {
  it('collects unique fromDocumentId values across edges', () => {
    const set = referencedSourceDocumentIds([
      edge({ fromNodeId: 'a', toNodeId: 'a', type: 'SUPPORTS', fromDocumentId: 'd1' }),
      edge({ fromNodeId: 'b', toNodeId: 'b', type: 'SUPPORTS', fromDocumentId: 'd1' }),
      edge({ fromNodeId: 'b', toNodeId: 'c', type: 'ASSOCIATED_WITH', fromDocumentId: 'd2' }),
    ]);
    expect(Array.from(set).sort()).toEqual(['d1', 'd2']);
  });

  it('skips edges without a fromDocumentId', () => {
    const set = referencedSourceDocumentIds([
      edge({ fromNodeId: 'a', toNodeId: 'a', type: 'SUPPORTS', fromDocumentId: null }),
      edge({ fromNodeId: 'b', toNodeId: 'b', type: 'SUPPORTS', fromDocumentId: 'd1' }),
    ]);
    expect(Array.from(set)).toEqual(['d1']);
  });

  it('returns an empty set for an empty edges input', () => {
    expect(referencedSourceDocumentIds([])).toEqual(new Set());
  });
});

describe('synthesizeSourceEdges', () => {
  const graphNodeIds = new Set(['n1', 'n2', 'n3']);
  const sourceIds = new Set(['s1', 's2']);

  it('produces one biomarker→source edge per (toNodeId, fromDocumentId) pair', () => {
    const synth = synthesizeSourceEdges(
      [
        edge({ fromNodeId: 'n1', toNodeId: 'n1', type: 'SUPPORTS', fromDocumentId: 's1' }),
        edge({ fromNodeId: 'n2', toNodeId: 'n2', type: 'SUPPORTS', fromDocumentId: 's1' }),
      ],
      graphNodeIds,
      sourceIds,
    );

    expect(synth).toHaveLength(2);
    expect(synth[0].fromNodeId).toBe('n1');
    expect(synth[0].toNodeId).toBe('s1');
    expect(synth[1].fromNodeId).toBe('n2');
    expect(synth[1].toNodeId).toBe('s1');
  });

  it('dedupes when one node has multiple SUPPORTS edges to the same document (multi-chunk provenance)', () => {
    // The schema models each chunk as its own SUPPORTS edge — three
    // chunks of the same document for the same biomarker = three rows.
    // The canvas should show ONE line, not three overlapping ones.
    const synth = synthesizeSourceEdges(
      [
        edge({ fromNodeId: 'n1', toNodeId: 'n1', type: 'SUPPORTS', fromDocumentId: 's1', fromChunkId: 'c1' }),
        edge({ fromNodeId: 'n1', toNodeId: 'n1', type: 'SUPPORTS', fromDocumentId: 's1', fromChunkId: 'c2' }),
        edge({ fromNodeId: 'n1', toNodeId: 'n1', type: 'SUPPORTS', fromDocumentId: 's1', fromChunkId: 'c3' }),
      ],
      graphNodeIds,
      sourceIds,
    );
    expect(synth).toHaveLength(1);
  });

  it('skips edges with null fromDocumentId', () => {
    const synth = synthesizeSourceEdges(
      [
        edge({ fromNodeId: 'n1', toNodeId: 'n1', type: 'SUPPORTS', fromDocumentId: null }),
        edge({ fromNodeId: 'n1', toNodeId: 'n2', type: 'ASSOCIATED_WITH', fromDocumentId: null }),
      ],
      graphNodeIds,
      sourceIds,
    );
    expect(synth).toEqual([]);
  });

  it('skips edges whose fromDocumentId points at a source the canvas does not have a node for', () => {
    const synth = synthesizeSourceEdges(
      [edge({ fromNodeId: 'n1', toNodeId: 'n1', type: 'SUPPORTS', fromDocumentId: 'missing-doc' })],
      graphNodeIds,
      sourceIds,
    );
    expect(synth).toEqual([]);
  });

  it('skips edges whose toNodeId was truncated out of the kept-nodes set', () => {
    // If the importance cap dropped a biomarker but a SUPPORTS edge
    // still references its id, the synthesised edge would point at a
    // missing node. Drop instead — better than a dangling line.
    const synth = synthesizeSourceEdges(
      [edge({ fromNodeId: 'n99', toNodeId: 'n99', type: 'SUPPORTS', fromDocumentId: 's1' })],
      graphNodeIds,
      sourceIds,
    );
    expect(synth).toEqual([]);
  });

  it('produces SUPPORTS-typed synthesised edges with a distinct synthetic-id prefix', () => {
    const synth = synthesizeSourceEdges(
      [edge({ fromNodeId: 'n1', toNodeId: 'n1', type: 'SUPPORTS', fromDocumentId: 's1' })],
      graphNodeIds,
      sourceIds,
    );
    expect(synth[0].type).toBe('SUPPORTS');
    expect(synth[0].id.startsWith('synth-supports-')).toBe(true);
  });
});
