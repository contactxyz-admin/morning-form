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
const { diffLatestPanelsMock, envState, loadEscalatedMarkerKeysMock } = vi.hoisted(() => ({
  diffLatestPanelsMock: vi.fn(),
  envState: { LONGITUDINAL_GRAPH_ENABLED: '', CLINICIAN_REVIEW_ENABLED: '' },
  loadEscalatedMarkerKeysMock: vi.fn(),
}));
vi.mock('@/lib/markers/panel-diff', () => ({
  diffLatestPanels: (...args: unknown[]) => diffLatestPanelsMock(...args),
}));
// Clinician-escalation override (pilot MVP plan 2026-07-04): stubbed —
// the fold itself is unit-tested in src/lib/review/overrides.test.ts; here we
// assert the route's wiring (flag gating + decoration placement).
vi.mock('@/lib/review/overrides', () => ({
  loadEscalatedMarkerKeys: (...args: unknown[]) => loadEscalatedMarkerKeysMock(...args),
}));
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    env: new Proxy(actual.env as Record<string, unknown>, {
      get: (target, prop) =>
        prop === 'LONGITUDINAL_GRAPH_ENABLED'
          ? envState.LONGITUDINAL_GRAPH_ENABLED
          : prop === 'CLINICIAN_REVIEW_ENABLED'
            ? envState.CLINICIAN_REVIEW_ENABLED
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
    envState.CLINICIAN_REVIEW_ENABLED = '';
    diffLatestPanelsMock.mockResolvedValue(null);
    loadEscalatedMarkerKeysMock.mockResolvedValue(new Set());
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
    // Prod-parity guard (flag OFF, this test): firstSeenAt / evidenceGrade are
    // demo-only fields the graph adapter sets — the authed route never emits
    // them. `interpretation` is now emitted on the authed map, but ONLY behind
    // the longitudinal flag with a real diff (plan 2026-06-30-001 U8); with the
    // flag off (this case) it must be absent — asserted here, and its flag-on
    // presence is asserted in the dedicated U8 test below.
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

  it('flag ON: attaches clinical interpretation for a CMO-authored marker (longitudinal U8)', async () => {
    envState.LONGITUDINAL_GRAPH_ENABLED = 'true';
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    // ferritin is a CMO-authored MATRIX marker → interpretation attaches.
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'ferritin')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));
    diffLatestPanelsMock.mockResolvedValue(ferritinDiff());

    const res = await GET();
    const body = await res.json();

    expect(body.nodes[0]).toHaveProperty('interpretation');
    expect(body.nodes[0].interpretation).toMatchObject({
      signalClarity: expect.any(String),
      flag: expect.any(String),
    });
  });

  it('flag ON: a STABLE authored marker still gets an interpretation (parity with the source page)', async () => {
    // A re-tested-but-stable authored marker carries interpretation, matching
    // enrichGroundedNodes on the source-detail page — interpretation is "where
    // it stands now", not gated on meaningful movement (plan 2026-06-30-001 U8).
    envState.LONGITUDINAL_GRAPH_ENABLED = 'true';
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'ferritin')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));
    diffLatestPanelsMock.mockResolvedValue({
      latestPanelAt: '2026-06-01T00:00:00.000Z',
      previousPanelAt: '2026-04-01T00:00:00.000Z',
      changes: [
        {
          marker: 'Ferritin',
          joinKey: 'ferritin',
          unit: 'ug/L',
          beforeValue: 120,
          beforeAt: '2026-04-01T00:00:00.000Z',
          afterValue: 122,
          afterAt: '2026-06-01T00:00:00.000Z',
          referenceLow: 30,
          referenceHigh: 400,
          direction: 'up' as const,
          classification: 'stable' as const,
        },
      ],
    });

    const res = await GET();
    const body = await res.json();
    expect(body.nodes[0].change).toMatchObject({ classification: 'stable' });
    expect(body.nodes[0]).toHaveProperty('interpretation');
  });

  it('flag ON: an UNAUTHORED changed marker gets a change but NO interpretation (no inferred flag)', async () => {
    envState.LONGITUDINAL_GRAPH_ENABLED = 'true';
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    // 'magnesium' is not a CMO-authored MATRIX marker → change only, no flag.
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'magnesium')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));
    diffLatestPanelsMock.mockResolvedValue({
      latestPanelAt: '2026-06-01T00:00:00.000Z',
      previousPanelAt: '2026-04-01T00:00:00.000Z',
      changes: [
        {
          marker: 'Magnesium',
          joinKey: 'magnesium',
          unit: 'mmol/L',
          beforeValue: 0.7,
          beforeAt: '2026-04-01T00:00:00.000Z',
          afterValue: 0.85,
          afterAt: '2026-06-01T00:00:00.000Z',
          referenceLow: 0.7,
          referenceHigh: 1.0,
          direction: 'up' as const,
          classification: 'stable' as const,
        },
      ],
    });

    const res = await GET();
    const body = await res.json();

    expect(body.nodes[0]).toHaveProperty('change');
    expect(body.nodes[0]).not.toHaveProperty('interpretation');
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

  // Clinician-escalation override (pilot MVP plan 2026-07-04).
  it('escalation override: flag ON forces the escalation tier on a BASELINE panel with the longitudinal flag OFF', async () => {
    envState.CLINICIAN_REVIEW_ENABLED = 'true';
    // Longitudinal deliberately OFF — the safety flag must not depend on it.
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'ferritin')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));
    loadEscalatedMarkerKeysMock.mockResolvedValue(new Set(['ferritin']));

    const res = await GET();
    const body = await res.json();

    expect(body.nodes[0].interpretation?.flag).toBe('escalation');
    expect(diffLatestPanelsMock).not.toHaveBeenCalled();
  });

  it('escalation override: a clinician escalation OVERRIDES the authored interpretation on a diffed panel', async () => {
    envState.LONGITUDINAL_GRAPH_ENABLED = 'true';
    envState.CLINICIAN_REVIEW_ENABLED = 'true';
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'ferritin')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));
    diffLatestPanelsMock.mockResolvedValue(ferritinDiff());
    loadEscalatedMarkerKeysMock.mockResolvedValue(new Set(['ferritin']));

    const res = await GET();
    const body = await res.json();

    // The authored interpretation for improved-ferritin would not be
    // 'escalation' — the human decision must win.
    expect(body.nodes[0].interpretation?.flag).toBe('escalation');
  });

  it('escalation override: flag OFF never loads the override set and adds no decoration', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'ferritin')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));

    const res = await GET();
    const body = await res.json();

    expect(loadEscalatedMarkerKeysMock).not.toHaveBeenCalled();
    expect(body.nodes[0]).not.toHaveProperty('interpretation');
  });

  it('escalation override: a load failure degrades to no decoration, never a 500', async () => {
    envState.CLINICIAN_REVIEW_ENABLED = 'true';
    getCurrentUser.mockResolvedValue({ id: 'user-1' });
    getFullGraphForUser.mockResolvedValue({ nodes: [makeNode('n1', 'ferritin')], edges: [] });
    getLatestSupportCapturedAt.mockResolvedValue(new Map([['n1', null]]));
    loadEscalatedMarkerKeysMock.mockRejectedValue(new Error('db down'));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes[0]).not.toHaveProperty('interpretation');
  });
});
