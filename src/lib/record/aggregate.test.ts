import { describe, expect, it } from 'vitest';
import type { GraphNodeRecord } from '@/lib/graph/types';
import { aggregateRecord } from './aggregate';
import type { AggregateEdgeRow, AggregateSourceRow, AggregateTopicRow } from './types';

function node(
  id: string,
  type: GraphNodeRecord['type'],
  canonicalKey: string,
  displayName = canonicalKey,
  createdAt = new Date('2026-04-10T00:00:00Z'),
): GraphNodeRecord {
  return {
    id,
    userId: 'u',
    type,
    canonicalKey,
    displayName,
    attributes: {},
    confidence: 1,
    promoted: true,
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

function edge(fromNodeId: string, toNodeId: string, fromDocumentId: string | null = null): AggregateEdgeRow {
  return { fromNodeId, toNodeId, fromDocumentId };
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
});
