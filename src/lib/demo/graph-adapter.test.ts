import { describe, expect, it } from 'vitest';
import { METABOLIC_PERSONA_GRAPH } from '../../../prisma/fixtures/synthetic/graph-narrative';
import { adaptDemoFixture } from './graph-adapter';

describe('adaptDemoFixture', () => {
  const adapted = adaptDemoFixture(METABOLIC_PERSONA_GRAPH);

  it('preserves the node count', () => {
    expect(adapted.graph.nodes.length).toBe(METABOLIC_PERSONA_GRAPH.nodes.length);
  });

  it('preserves the edge count', () => {
    expect(adapted.graph.edges.length).toBe(METABOLIC_PERSONA_GRAPH.edges.length);
  });

  it('uses node.nodeKey as the wire id (locked identity rule)', () => {
    const fixtureKeys = new Set(METABOLIC_PERSONA_GRAPH.nodes.map((n) => n.nodeKey));
    for (const node of adapted.graph.nodes) {
      expect(fixtureKeys.has(node.id)).toBe(true);
    }
  });

  it('every edge resolves to valid node ids', () => {
    const ids = new Set(adapted.graph.nodes.map((n) => n.id));
    for (const edge of adapted.graph.edges) {
      expect(ids.has(edge.fromNodeId)).toBe(true);
      expect(ids.has(edge.toNodeId)).toBe(true);
    }
  });

  it('score is monotonic with edge degree', () => {
    // Find two nodes: a hub with many edges and a leaf with one. Hub
    // should have a higher score.
    const degree = new Map<string, number>();
    for (const edge of METABOLIC_PERSONA_GRAPH.edges) {
      degree.set(edge.fromNodeKey, (degree.get(edge.fromNodeKey) ?? 0) + 1);
      degree.set(edge.toNodeKey, (degree.get(edge.toNodeKey) ?? 0) + 1);
    }
    const sorted = Array.from(degree.entries()).sort((a, b) => b[1] - a[1]);
    const [hub] = sorted[0];
    const [leaf] = sorted[sorted.length - 1];
    const hubScore = adapted.graph.nodes.find((n) => n.id === hub)!.score;
    const leafScore = adapted.graph.nodes.find((n) => n.id === leaf)!.score;
    expect(hubScore).toBeGreaterThan(leafScore);
  });

  it('is deterministic across calls', () => {
    const a = adaptDemoFixture(METABOLIC_PERSONA_GRAPH);
    const b = adaptDemoFixture(METABOLIC_PERSONA_GRAPH);
    expect(JSON.stringify(a.graph)).toBe(JSON.stringify(b.graph));
  });

  it('synthesizes userId="demo" on every node', () => {
    for (const node of adapted.graph.nodes) {
      expect(node.userId).toBe('demo');
    }
  });

  it('emits deterministic edge ids of the form from__type__to', () => {
    for (const edge of adapted.graph.edges) {
      expect(edge.id).toBe(`${edge.fromNodeId}__${edge.type}__${edge.toNodeId}`);
    }
  });

  describe('panel-change decoration passthrough', () => {
    it('passes a fixture node.change through to the wire node', () => {
      // The fixture decorates four biomarker nodes; each must arrive on the
      // wire node verbatim so the canvas ring/badge + detail sheet light up.
      const decorated = METABOLIC_PERSONA_GRAPH.nodes.filter((n) => n.change);
      expect(decorated.length).toBeGreaterThan(0);
      for (const fixtureNode of decorated) {
        const wire = adapted.graph.nodes.find((n) => n.id === fixtureNode.nodeKey);
        expect(wire!.change).toEqual(fixtureNode.change);
      }
    });

    it('omits change on nodes the fixture did not decorate', () => {
      const undecorated = METABOLIC_PERSONA_GRAPH.nodes.filter((n) => !n.change);
      for (const fixtureNode of undecorated) {
        const wire = adapted.graph.nodes.find((n) => n.id === fixtureNode.nodeKey);
        expect(wire!.change).toBeUndefined();
      }
    });

    it('covers all four visible change tones for the audit', () => {
      const classes = new Set(
        adapted.graph.nodes.flatMap((n) => (n.change ? [n.change.classification] : [])),
      );
      expect(classes).toEqual(new Set(['improved', 'worsened', 'stable', 'new']));
    });
  });

  describe('firstSeenAt passthrough (time scrubber)', () => {
    it('passes a fixture node.firstSeenAt through to the wire node verbatim', () => {
      const dated = METABOLIC_PERSONA_GRAPH.nodes.filter((n) => n.firstSeenAt);
      expect(dated.length).toBeGreaterThan(0);
      for (const fixtureNode of dated) {
        const wire = adapted.graph.nodes.find((n) => n.id === fixtureNode.nodeKey);
        expect(wire!.firstSeenAt).toBe(fixtureNode.firstSeenAt);
      }
    });

    it('omits firstSeenAt (no `undefined` key) when the fixture node lacks it', () => {
      // Byte-shape parity: an undated node must not carry firstSeenAt at all,
      // so the wire stays identical to the authed record route's shape.
      const undated = adaptDemoFixture({
        version: 'test',
        sources: [],
        nodes: [
          { nodeKey: 'x', type: 'biomarker', canonicalKey: 'x', displayName: 'X' },
        ],
        edges: [],
      });
      const wire = undated.graph.nodes[0];
      expect('firstSeenAt' in wire).toBe(false);
    });
  });

  describe('provenance lookup', () => {
    it('contains an entry for every node', () => {
      for (const node of adapted.graph.nodes) {
        expect(adapted.provenanceByNodeId.has(node.id)).toBe(true);
      }
    });

    it('a node with grounded edges surfaces fixture chunks', () => {
      // Find a node that has at least one edge with a fromChunkKey.
      const groundedEdge = METABOLIC_PERSONA_GRAPH.edges.find((e) => e.fromChunkKey);
      expect(groundedEdge).toBeDefined();
      const provenance = adapted.provenanceByNodeId.get(groundedEdge!.fromNodeKey);
      expect(provenance!.chunks.length).toBeGreaterThan(0);
    });

    it('chunks are de-duplicated across multiple edges', () => {
      // No node's chunks list should contain the same chunkKey twice.
      for (const provenance of Array.from(adapted.provenanceByNodeId.values())) {
        const keys = provenance.chunks.map((c: { chunkKey: string }) => c.chunkKey);
        expect(keys.length).toBe(new Set(keys).size);
      }
    });
  });
});
