import { describe, expect, it } from 'vitest';
import { METABOLIC_PERSONA_GRAPH } from '../../../prisma/fixtures/synthetic/graph-narrative';
import { scrubberStops } from '../graph/as-of';
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

  describe('change decoration is DERIVED from source (no authored tones)', () => {
    it('derives a change ring for every node that carries readings', () => {
      const withReadings = METABOLIC_PERSONA_GRAPH.nodes.filter((n) => n.readings?.length);
      expect(withReadings.length).toBeGreaterThan(0);
      for (const fixtureNode of withReadings) {
        const wire = adapted.graph.nodes.find((n) => n.id === fixtureNode.nodeKey);
        expect(wire!.change).toBeDefined();
      }
    });

    it('omits change on nodes with no readings', () => {
      const noReadings = METABOLIC_PERSONA_GRAPH.nodes.filter((n) => !n.readings?.length);
      for (const fixtureNode of noReadings) {
        const wire = adapted.graph.nodes.find((n) => n.id === fixtureNode.nodeKey);
        expect(wire!.change).toBeUndefined();
      }
    });

    // ── Anti-regression guard (plan 2026-06-16-002 R1/R3) ──
    // No derived ring may contradict the readings it was computed from: the
    // direction must agree with the sign of (after − before), and the
    // before/after values + unit must be the node's actual recorded readings.
    it('NEVER contradicts the source: direction + values match the readings', () => {
      for (const fixtureNode of METABOLIC_PERSONA_GRAPH.nodes) {
        const readings = fixtureNode.readings;
        if (!readings?.length) continue;
        const wire = adapted.graph.nodes.find((n) => n.id === fixtureNode.nodeKey);
        const change = wire!.change!;
        const sorted = [...readings].sort((a, b) => a.at.localeCompare(b.at));
        const after = sorted[sorted.length - 1];
        const before = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

        // after/unit always reflect the latest reading.
        expect(change.afterValue).toBe(after.value);
        expect(change.unit).toBe(after.unit);

        if (!before) {
          expect(change.classification).toBe('new');
          expect(change.beforeValue).toBeNull();
          expect(change.direction).toBeNull();
          continue;
        }
        expect(change.beforeValue).toBe(before.value);
        const expected =
          after.value > before.value ? 'up' : after.value < before.value ? 'down' : 'flat';
        expect(change.direction).toBe(expected); // a red "worsened" on an ↑ that improved is now impossible
      }
    });

    it('derives an honest clinical mix from source (CMO persona 2026-06-16)', () => {
      // One credible change (LDL-C rose above the attention threshold), one
      // newly captured signal (ApoB), plus the within-range recovery markers —
      // every tone derived from the recorded values, none authored.
      const tone = (id: string) =>
        adapted.graph.nodes.find((n) => n.id === id)!.change!.classification;
      expect(tone('bm-ldl')).toBe('worsened'); // 2.7 → 3.4, above attention threshold
      expect(tone('bm-apob')).toBe('new'); // first measured in 2026, no trend
      expect(tone('bm-hba1c')).toBe('improved');
      expect(tone('bm-ferritin')).toBe('stable');
      expect(tone('bm-free-test')).toBe('stable');
      // The honest mix the CMO asked for spans worsened + new + improved + stable.
      const tones = new Set(
        adapted.graph.nodes.flatMap((n) => (n.change ? [n.change.classification] : [])),
      );
      expect(tones).toEqual(new Set(['worsened', 'new', 'improved', 'stable']));
    });
  });

  describe('evidence grading (plan 2026-06-16-002 R9)', () => {
    it('grades every node by its strongest grounding source', () => {
      for (const node of adapted.graph.nodes) {
        expect(node.evidenceGrade).toBeDefined();
      }
    });
    it('a lab-grounded biomarker grades above a self-report/inferred node', () => {
      const rank = { lab: 4, clinician: 3, device: 2, self_reported: 1, inferred: 0 };
      const ferritin = adapted.graph.nodes.find((n) => n.id === 'bm-ferritin')!;
      const fatigue = adapted.graph.nodes.find((n) => n.id === 'sym-fatigue')!;
      // ferritin is grounded in a lab panel; fatigue is linked only by association.
      expect(ferritin.evidenceGrade).toBe('lab');
      expect(rank[ferritin.evidenceGrade!]).toBeGreaterThan(rank[fatigue.evidenceGrade!]);
    });
  });

  describe('no causal overclaim (plan 2026-06-16-002 R8)', () => {
    it('the fixture asserts no proven causation — no CAUSES edges', () => {
      const causal = METABOLIC_PERSONA_GRAPH.edges.filter((e) => e.type === ('CAUSES' as string));
      expect(causal).toHaveLength(0);
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

  describe('time-scrubber stops (fixture narrative)', () => {
    it('grows the graph through 5 distinct dated stops, latest last', () => {
      // Four firstSeenAt birth-dates (2024-04, 2024-05, 2025-05, 2025-08) plus
      // the 2026-02 recheck where the change rings come due = 5 stops.
      const stops = scrubberStops(adapted.graph.nodes);
      expect(stops).toHaveLength(5);
      // strictly increasing
      expect([...stops].sort((a, b) => a - b)).toEqual(stops);
      expect(stops[stops.length - 1]).toBe(Date.parse('2026-02-10T09:00:00.000Z'));
      expect(stops[0]).toBe(Date.parse('2024-04-20T09:00:00.000Z'));
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
