import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphEdgeRecord, GraphNodeRecord } from '@/lib/graph/types';

const getCurrentUser = vi.fn();
const getFullGraphForUser = vi.fn();
const getLatestSupportCapturedAt = vi.fn();
const sourceDocumentFindMany = vi.fn();
const topicPageFindMany = vi.fn();

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => getCurrentUser(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    sourceDocument: { findMany: (...args: unknown[]) => sourceDocumentFindMany(...args) },
    topicPage: { findMany: (...args: unknown[]) => topicPageFindMany(...args) },
  },
}));

vi.mock('@/lib/graph/queries', () => ({
  getFullGraphForUser: (...args: unknown[]) => getFullGraphForUser(...args),
  getLatestSupportCapturedAt: (...args: unknown[]) => getLatestSupportCapturedAt(...args),
}));

// Longitudinal change-decoration (plan 2026-06-10-003 U1). Stub the panel
// diff and a dynamic LONGITUDINAL_GRAPH_ENABLED flag; all other env fields
// pass through to the real env so unrelated readers (registry, importance)
// are unaffected.
const { diffLatestPanelsMock, envState } = vi.hoisted(() => ({
  diffLatestPanelsMock: vi.fn(),
  envState: { LONGITUDINAL_GRAPH_ENABLED: '' },
}));
vi.mock('@/lib/markers/panel-diff', () => ({
  diffLatestPanels: (...args: unknown[]) => diffLatestPanelsMock(...args),
}));
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    env: new Proxy(actual.env as Record<string, unknown>, {
      get: (target, prop) =>
        prop === 'LONGITUDINAL_GRAPH_ENABLED'
          ? envState.LONGITUDINAL_GRAPH_ENABLED
          : (target as Record<string, unknown>)[prop as string],
    }),
  };
});

import { GET } from './route';

function makeNode(id: string, canonicalKey: string): GraphNodeRecord {
  return {
    id,
    userId: 'user-1',
    type: 'biomarker',
    canonicalKey,
    displayName: canonicalKey,
    attributes: {},
    confidence: 1,
    promoted: true,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  };
}

function makeEdge(from: string, to: string): GraphEdgeRecord {
  return {
    id: `${from}-${to}`,
    userId: 'user-1',
    type: 'ASSOCIATED_WITH',
    fromNodeId: from,
    toNodeId: to,
    fromChunkId: null,
    fromDocumentId: null,
    weight: 1,
    metadata: {},
    createdAt: new Date('2026-05-01T00:00:00Z'),
  };
}

describe('GET /api/record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceDocumentFindMany.mockResolvedValue([]);
    topicPageFindMany.mockResolvedValue([]);
    getLatestSupportCapturedAt.mockResolvedValue(new Map());
    envState.LONGITUDINAL_GRAPH_ENABLED = '';
    diffLatestPanelsMock.mockResolvedValue(null);
  });

  function ferritinDiff() {
    return {
      latestPanelAt: '2026-06-01T00:00:00.000Z',
      previousPanelAt: '2026-04-01T00:00:00.000Z',
      changes: [
        {
          marker: 'Ferritin',
          joinKey: 'ferritin',
          unit: 'ug/L',
          beforeValue: 18,
          beforeAt: '2026-04-01T00:00:00.000Z',
          afterValue: 41,
          afterAt: '2026-06-01T00:00:00.000Z',
          referenceLow: 30,
          referenceHigh: 400,
          direction: 'up' as const,
          classification: 'improved' as const,
        },
      ],
    };
  }

  it('401 when unauthenticated', async () => {
    getCurrentUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Authentication required.' });
  });

  it('200 with merged shape when authed and graph empty (skips recencyMap query)', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [], edges: [] });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      topics: expect.any(Array),
      recentActivity: [],
      graphSummary: { nodeCount: 0, sourceCount: 0, topicCount: expect.any(Number) },
      nodes: [],
      edges: [],
      sources: [],
      nodeTypeCounts: {},
      truncated: false,
      totalNodes: 0,
    });
    // Empty graph short-circuits the recency query — saves a DB round-trip.
    expect(getLatestSupportCapturedAt).not.toHaveBeenCalled();
  });

  it('200 with importance-scored nodes when authed and graph non-empty', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    const nodes = [makeNode('n1', 'ferritin'), makeNode('n2', 'hrv')];
    const edges = [makeEdge('n1', 'n2')];
    getFullGraphForUser.mockResolvedValue({ nodes, edges });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null], ['n2', null]]));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalNodes).toBe(2);
    expect(body.nodes).toHaveLength(2);
    expect(body.nodes[0]).toMatchObject({
      canonicalKey: expect.any(String),
      tier: expect.any(Number),
      score: expect.any(Number),
    });
    // Prod-parity guard: firstSeenAt / evidenceGrade / interpretation are
    // demo-only fields the graph adapter sets — the authed route must never
    // emit them (plans 2026-06-15-001, 2026-06-16-002/003).
    expect(body.nodes[0]).not.toHaveProperty('firstSeenAt');
    expect(body.nodes[0]).not.toHaveProperty('evidenceGrade');
    expect(body.nodes[0]).not.toHaveProperty('interpretation');
    expect(body.truncated).toBe(false);
    expect(getLatestSupportCapturedAt).toHaveBeenCalledTimes(1);
  });

  it('500 when the underlying query throws (error envelope, not unhandled)', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockRejectedValue(new Error('db unreachable'));

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Failed to load record.' });
  });

  it('Cache-Control is no-store (no CDN caching of per-user vault state)', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [], edges: [] });

    const res = await GET();

    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('serializes node timestamps as ISO strings (wire shape, not Date)', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    const nodes = [makeNode('n1', 'ferritin')];
    getFullGraphForUser.mockResolvedValue({ nodes, edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));

    const res = await GET();

    const body = await res.json();
    expect(typeof body.nodes[0].createdAt).toBe('string');
    expect(body.nodes[0].createdAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('flag ON: decorates the matching biomarker node with its change (longitudinal U1)', async () => {
    envState.LONGITUDINAL_GRAPH_ENABLED = 'true';
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'ferritin')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));
    diffLatestPanelsMock.mockResolvedValue(ferritinDiff());

    const res = await GET();
    const body = await res.json();

    expect(body.nodes[0].change).toMatchObject({
      classification: 'improved',
      direction: 'up',
      beforeValue: 18,
      afterValue: 41,
      unit: 'ug/L',
    });
    // The reference range is dropped from the wire decoration.
    expect(body.nodes[0].change).not.toHaveProperty('referenceLow');
  });

  it('flag OFF: never calls the diff and emits no change field (byte-for-byte parity)', async () => {
    envState.LONGITUDINAL_GRAPH_ENABLED = '';
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'ferritin')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));
    // Even if the diff would return changes, the flag-off path must not call it.
    diffLatestPanelsMock.mockResolvedValue(ferritinDiff());

    const res = await GET();
    const body = await res.json();

    expect(diffLatestPanelsMock).not.toHaveBeenCalled();
    expect(body.nodes[0]).not.toHaveProperty('change');
  });

  it('flag ON but diff throws: degrades to no decoration, not a 500', async () => {
    envState.LONGITUDINAL_GRAPH_ENABLED = 'true';
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'ferritin')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));
    diffLatestPanelsMock.mockRejectedValue(new Error('diff boom'));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nodes[0]).not.toHaveProperty('change');
  });

  it('flag ON, only one panel (no previous): no decoration', async () => {
    envState.LONGITUDINAL_GRAPH_ENABLED = 'true';
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'ferritin')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));
    diffLatestPanelsMock.mockResolvedValue({
      latestPanelAt: '2026-06-01T00:00:00.000Z',
      previousPanelAt: null,
      changes: [{ ...ferritinDiff().changes[0], classification: 'new', direction: null, beforeValue: null, beforeAt: null }],
    });

    const res = await GET();
    const body = await res.json();

    expect(body.nodes[0]).not.toHaveProperty('change');
  });
});
