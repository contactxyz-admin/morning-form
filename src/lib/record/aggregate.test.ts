import { describe, expect, it } from 'vitest';
import type { GraphEdgeRecord, GraphNodeRecord } from '@/lib/graph/types';
import { aggregateRecord } from './aggregate';
import type { AggregateSourceRow, AggregateTopicRow } from './types';

function node(
  id: string,
  type: GraphNodeRecord['type'],
  canonicalKey: string,
  displayName = canonicalKey,
  createdAt = new Date('2026-04-10T00:00:00Z'),
  promoted = true,
): GraphNodeRecord {
  return {
    id,
    userId: 'u',
    type,
    canonicalKey,
    displayName,
    attributes: {},
    confidence: 1,
    promoted,
    createdAt,
    updatedAt: createdAt,
  };
}

function topic(topicKey: string, status: string, updatedAt = new Date('2026-04-11T00:00:00Z')): AggregateTopicRow {
  return { topicKey, status, updatedAt };
}

function source(
  id: string,
  kind: string,
  createdAt: Date,
  capturedAt = createdAt,
): AggregateSourceRow {
  return { id, kind, capturedAt, createdAt };
}

function edge(
  fromNodeId: string,
  toNodeId: string,
  fromDocumentId: string | null = null,
  type: GraphEdgeRecord['type'] = 'ASSOCIATED_WITH',
): GraphEdgeRecord {
  return {
    id: `${fromNodeId}-${type}-${toNodeId}`,
    userId: 'u',
    type,
    fromNodeId,
    toNodeId,
    fromChunkId: null,
    fromDocumentId,
    weight: 1,
    metadata: {},
    createdAt: new Date('2026-04-10T00:00:00Z'),
  };
}

describe('aggregateRecord', () => {
  it('new user with intake — three topic stubs, graph + source counts populate', () => {
    const nodes = [
      node('n1', 'biomarker', 'ferritin', 'Ferritin'),
      node('n2', 'biomarker', 'haemoglobin', 'Haemoglobin'),
      node('n3', 'symptom', 'fatigue', 'Fatigue'),
      node('n4', 'biomarker', 'hrv', 'HRV'),
      node('n5', 'metric_window', 'sleep_duration', 'Sleep Duration'),
    ];
    const sources = [source('s1', 'lab_pdf', new Date('2026-04-09T10:00:00Z'))];
    const edges = [
      edge('n1', 'n3', 's1'),
      edge('n2', 'n3', 's1'),
    ];

    const result = aggregateRecord({ topics: [], nodes, sources, edges });

    expect(result.topics).toHaveLength(3);
    expect(result.topics.every((t) => t.status === 'stub')).toBe(true);
    expect(result.graphSummary.nodeCount).toBe(5);
    expect(result.graphSummary.sourceCount).toBe(1);
    expect(result.graphSummary.topicCount).toBe(3);

    const iron = result.topics.find((t) => t.topicKey === 'iron')!;
    expect(iron.nodeCount).toBe(2);
    expect(iron.sourceCount).toBe(1);
    expect(iron.hasEvidence).toBe(true);
  });

  it('iron compiled → iron: full, sleep/energy: stub', () => {
    const nodes = [node('n1', 'biomarker', 'ferritin', 'Ferritin')];
    const topics: AggregateTopicRow[] = [
      topic('iron', 'full', new Date('2026-04-12T10:00:00Z')),
      topic('sleep-recovery', 'stub'),
    ];

    const result = aggregateRecord({ topics, nodes, sources: [], edges: [] });

    const byKey = Object.fromEntries(result.topics.map((t) => [t.topicKey, t]));
    expect(byKey['iron'].status).toBe('full');
    expect(byKey['iron'].updatedAt).toBe('2026-04-12T10:00:00.000Z');
    expect(byKey['sleep-recovery'].status).toBe('stub');
    expect(byKey['energy-fatigue'].status).toBe('stub');
    expect(byKey['energy-fatigue'].updatedAt).toBeNull();
  });

  it('zero topics, zero sources → empty arrays and zero counts, not null', () => {
    const result = aggregateRecord({ topics: [], nodes: [], sources: [], edges: [] });

    expect(result.topics).toHaveLength(3); // topic configs — three stubs
    expect(result.recentActivity).toEqual([]);
    expect(result.graphSummary).toEqual({ nodeCount: 0, sourceCount: 0, topicCount: 3 });
    expect(result.topics.every((t) => t.sourceCount === 0 && t.nodeCount === 0)).toBe(true);
    // Graph fields are present but empty on a blank record.
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.nodeTypeCounts).toEqual({});
    expect(result.truncated).toBe(false);
    expect(result.totalNodes).toBe(0);
  });

  it('serialises sources to the wire shape with ISO timestamps + canonical kind', () => {
    const capturedAt = new Date('2026-04-09T10:00:00Z');
    const createdAt = new Date('2026-04-09T11:00:00Z');
    const result = aggregateRecord({
      topics: [],
      nodes: [],
      sources: [{ id: 's-1', kind: 'lab_pdf', capturedAt, createdAt }],
      edges: [],
    });

    expect(result.sources).toEqual([
      {
        id: 's-1',
        kind: 'lab_pdf',
        capturedAt: '2026-04-09T10:00:00.000Z',
        createdAt: '2026-04-09T11:00:00.000Z',
      },
    ]);
  });

  it('normalises legacy / unknown source kinds to lab_pdf at the wire boundary', () => {
    // SourceDocument.kind is a free `String` in Prisma so legacy rows
    // (or future renames) may hold values that are not in the current
    // `SOURCE_DOCUMENT_KINDS` enum. The wire shape MUST stay typed to
    // the enum so external MCP agents can exhaustive-switch — so we
    // normalise unknowns to `lab_pdf` (the most common kind, safe
    // visual default). This test pins that normalisation.
    const result = aggregateRecord({
      topics: [],
      nodes: [],
      sources: [
        {
          id: 's-legacy',
          kind: 'legacy_kind_not_in_enum',
          capturedAt: new Date('2026-04-09T10:00:00Z'),
          createdAt: new Date('2026-04-09T11:00:00Z'),
        },
      ],
      edges: [],
    });

    expect(result.sources[0].kind).toBe('lab_pdf');
  });

  it('activity is reverse-chronological across sources, topic compiles, and nodes', () => {
    const older = new Date('2026-04-05T00:00:00Z');
    const newer = new Date('2026-04-10T00:00:00Z');
    const newest = new Date('2026-04-15T00:00:00Z');

    const result = aggregateRecord({
      topics: [topic('iron', 'full', newer)],
      nodes: [node('n1', 'biomarker', 'ferritin', 'Ferritin', newest)],
      sources: [source('s1', 'lab_pdf', older)],
      edges: [],
    });

    expect(result.recentActivity[0].kind).toBe('node-added');
    expect(result.recentActivity[1].kind).toBe('topic-compiled');
    expect(result.recentActivity[2].kind).toBe('source-added');
  });

  it('node-added activity targets /record?entity=<canonicalKey> (vault entity-state URL, not retired /graph)', () => {
    const result = aggregateRecord({
      topics: [],
      nodes: [node('n1', 'biomarker', 'ferritin', 'Ferritin')],
      sources: [],
      edges: [],
    });

    const nodeEntry = result.recentActivity.find((a) => a.kind === 'node-added')!;
    expect(nodeEntry.targetHref).toBe('/record?entity=ferritin');
  });

  it('recent activity is capped at 10 entries', () => {
    const sources = Array.from({ length: 15 }, (_, i) =>
      source(`s${i}`, 'lab_pdf', new Date(2026, 3, i + 1)),
    );
    const result = aggregateRecord({ topics: [], nodes: [], sources, edges: [] });

    expect(result.recentActivity).toHaveLength(10);
    // Sort check — newer first.
    const tsOrder = result.recentActivity.map((a) => a.ts);
    const sortedDesc = [...tsOrder].sort().reverse();
    expect(tsOrder).toEqual(sortedDesc);
  });

  describe('graph fields (importance + cap + edges)', () => {
    it('emits importance-scored nodes ordered by score (highest first)', () => {
      const nodes = [
        node('n1', 'biomarker', 'ferritin', 'Ferritin'), // promoted
        node('n2', 'biomarker', 'hrv', 'HRV', undefined, false), // not promoted
        node('n3', 'symptom', 'fatigue', 'Fatigue'), // promoted
      ];
      const edges = [
        edge('n1', 'n3'), // n1 + n3 each get a degree edge
        edge('n1', 'n2'), // n1 gets another
      ];

      const result = aggregateRecord({ topics: [], nodes, sources: [], edges });

      // n1 has promoted + 2 degree edges → highest score.
      expect(result.nodes[0].canonicalKey).toBe('ferritin');
      expect(result.nodes[0].score).toBeGreaterThan(result.nodes[1].score);
      expect(result.nodes[0].tier).toBeLessThanOrEqual(result.nodes[1].tier);
      // Every node carries tier + score.
      expect(result.nodes.every((n) => typeof n.tier === 'number' && typeof n.score === 'number')).toBe(true);
    });

    it('caps nodes at nodeCap and reports truncated=true', () => {
      const manyNodes = Array.from({ length: 5 }, (_, i) =>
        node(`n${i}`, 'biomarker', `m${i}`, `M${i}`),
      );

      const result = aggregateRecord({
        topics: [],
        nodes: manyNodes,
        sources: [],
        edges: [],
        nodeCap: 3,
      });

      expect(result.totalNodes).toBe(5);
      expect(result.nodes).toHaveLength(3);
      expect(result.truncated).toBe(true);
    });

    it('filters edges to the kept-nodes set when truncated', () => {
      const nodes = [
        node('keep1', 'biomarker', 'ferritin', 'Ferritin'),
        node('keep2', 'biomarker', 'hrv', 'HRV'),
        node('drop', 'biomarker', 'cholesterol', 'Cholesterol'),
      ];
      // Without a cap on a 3-node set, all three are kept. Force a cap so
      // one node drops, then assert any edge touching the dropped node is
      // filtered out.
      const edges = [
        edge('keep1', 'keep2', null, 'ASSOCIATED_WITH'),
        edge('keep1', 'drop', null, 'ASSOCIATED_WITH'), // should drop
      ];

      const result = aggregateRecord({
        topics: [],
        nodes,
        sources: [],
        edges,
        nodeCap: 2,
      });

      const keptIds = new Set(result.nodes.map((n) => n.id));
      expect(result.edges.every((e) => keptIds.has(e.fromNodeId) && keptIds.has(e.toNodeId))).toBe(true);
      // The keep1-drop edge must be gone.
      expect(result.edges.some((e) => e.fromNodeId === 'drop' || e.toNodeId === 'drop')).toBe(false);
    });

    it('omitting nodeCap falls back to the production default of 200', () => {
      // Pin the constant — a refactor that flips DEFAULT_NODE_CAP from 200
      // to anything else would silently change behavior in production; this
      // test fails loudly so it must be deliberate.
      const manyNodes = Array.from({ length: 201 }, (_, i) =>
        node(`n${i}`, 'biomarker', `marker${i}`, `Marker ${i}`),
      );

      const result = aggregateRecord({
        topics: [],
        nodes: manyNodes,
        sources: [],
        edges: [],
      });

      expect(result.totalNodes).toBe(201);
      expect(result.nodes).toHaveLength(200);
      expect(result.truncated).toBe(true);
    });

    it('nodeCap=0 explicitly truncates to zero nodes (does NOT mean "unlimited")', () => {
      // The current contract: `nodeCap ?? DEFAULT_NODE_CAP` uses nullish
      // coalescing, so 0 passes through and slice(0, 0) yields []. This
      // test locks the contract so a future refactor to `||` (which would
      // silently default 0 -> 200) breaks loudly.
      const nodes = [
        node('n1', 'biomarker', 'ferritin'),
        node('n2', 'biomarker', 'hrv'),
      ];

      const result = aggregateRecord({
        topics: [],
        nodes,
        sources: [],
        edges: [],
        nodeCap: 0,
      });

      expect(result.totalNodes).toBe(2);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.truncated).toBe(true);
    });

    it('builds nodeTypeCounts across the kept set', () => {
      const nodes = [
        node('n1', 'biomarker', 'ferritin'),
        node('n2', 'biomarker', 'hrv'),
        node('n3', 'symptom', 'fatigue'),
        node('n4', 'intervention', 'iron-protocol'),
      ];

      const result = aggregateRecord({ topics: [], nodes, sources: [], edges: [] });

      expect(result.nodeTypeCounts.biomarker).toBe(2);
      expect(result.nodeTypeCounts.symptom).toBe(1);
      expect(result.nodeTypeCounts.intervention).toBe(1);
    });

    it('excludes lab-reading observation instances (INSTANCE_OF a biomarker) from the canvas, counts, and activity (longitudinal U6)', () => {
      const nodes = [
        node('concept', 'biomarker', 'ferritin', 'Ferritin'),
        node('obs1', 'observation', 'obs_ferritin_2026_04_01', 'Ferritin · 2026-04-01'),
        node('obs2', 'observation', 'obs_ferritin_2026_06_01', 'Ferritin · 2026-06-01'),
        // A standalone vital-sign observation (no INSTANCE_OF to a biomarker)
        // must NOT be filtered.
        node('vital', 'observation', 'bp_systolic', 'Systolic BP'),
      ];
      const edges = [
        edge('obs1', 'concept', null, 'INSTANCE_OF'),
        edge('obs2', 'concept', null, 'INSTANCE_OF'),
      ];

      const result = aggregateRecord({ topics: [], nodes, sources: [], edges });

      const ids = result.nodes.map((n) => n.id).sort();
      expect(ids).toEqual(['concept', 'vital']);
      // Counts reflect graph concepts, not history points.
      expect(result.totalNodes).toBe(2);
      expect(result.graphSummary.nodeCount).toBe(2);
      expect(result.nodeTypeCounts.observation).toBe(1); // only the vital
      expect(result.nodeTypeCounts.biomarker).toBe(1);
      // Instances don't appear in the recent-activity log either.
      expect(result.recentActivity.some((a) => a.label.includes('· 2026-'))).toBe(false);
    });

    it('recencyMap (when supplied) lifts the score of recent nodes', () => {
      const recentDate = new Date(); // very recent → within recency window
      const nodes = [
        node('recent', 'biomarker', 'ferritin', 'Ferritin'),
        node('stale', 'biomarker', 'hrv', 'HRV'),
      ];
      const recencyMap = new Map<string, Date | null>([
        ['recent', recentDate],
        ['stale', null],
      ]);

      const result = aggregateRecord({
        topics: [],
        nodes,
        sources: [],
        edges: [],
        recencyMap,
      });

      const recent = result.nodes.find((n) => n.id === 'recent')!;
      const stale = result.nodes.find((n) => n.id === 'stale')!;
      expect(recent.score).toBeGreaterThan(stale.score);
    });

    it('changedNodeIds lift saves a moved marker from the node cap (longitudinal follow-up)', () => {
      const nodes = [
        node('a', 'biomarker', 'ma', 'A'),
        node('moved', 'biomarker', 'mb', 'B'),
        node('c', 'biomarker', 'mc', 'C'),
      ];
      // All three score equally (promoted) and the cap keeps only one. The
      // +2 change lift must make the moved marker the survivor.
      const result = aggregateRecord({
        topics: [],
        nodes,
        sources: [],
        edges: [],
        nodeCap: 1,
        changedNodeIds: new Set(['moved']),
      });

      expect(result.truncated).toBe(true);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('moved');
      expect(result.nodes[0].tier).toBe(1); // promoted(3) + change(2) = 5
    });
  });
});
