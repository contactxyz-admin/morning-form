import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { ingestExtraction } from '@/lib/graph/mutations';

const currentUserMock = vi.fn<() => Promise<{ id: string } | null>>();
const envMock = { NODE_ENV: 'test', LONGITUDINAL_GRAPH_ENABLED: 'true' };

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));
vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));
vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

import { GET } from './route';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});
afterAll(async () => {
  await teardownTestDb();
});
afterEach(() => {
  currentUserMock.mockReset();
  envMock.LONGITUDINAL_GRAPH_ENABLED = 'true';
});

/** Ingest a single-marker ferritin panel; returns its SourceDocument id. */
async function ingestFerritin(userId: string, date: string, value: number): Promise<string> {
  const res = await ingestExtraction(prisma, userId, {
    document: { kind: 'lab_pdf', sourceRef: `p-${date}.pdf`, contentHash: `hash-${userId}-${date}`, capturedAt: new Date(date) },
    chunks: [{ index: 0, text: `Ferritin ${value}`, offsetStart: 0, offsetEnd: 10 }],
    nodes: [
      {
        type: 'biomarker',
        canonicalKey: 'ferritin',
        displayName: 'Ferritin',
        attributes: { value, unit: 'ug/L', referenceRangeLow: 30, referenceRangeHigh: 400, collectionDate: date, latestValue: value, latestValueAt: new Date(date).toISOString() },
        supportingChunkIndices: [0],
      },
      {
        type: 'observation',
        canonicalKey: `obs_ferritin_${date.replace(/-/g, '_')}`,
        displayName: `Ferritin · ${date}`,
        attributes: { value, unit: 'ug/L', measuredAt: new Date(date).toISOString() },
        promoted: false,
        supportingChunkIndices: [0],
      },
    ],
    edges: [
      { type: 'INSTANCE_OF', fromType: 'observation', fromCanonicalKey: `obs_ferritin_${date.replace(/-/g, '_')}`, toType: 'biomarker', toCanonicalKey: 'ferritin' },
    ],
  });
  return res.documentId;
}

function call(from?: string, to?: string): Promise<Response> {
  const url = new URL('http://localhost/api/panels/diff');
  if (from !== undefined) url.searchParams.set('from', from);
  if (to !== undefined) url.searchParams.set('to', to);
  return GET(new NextRequest(url));
}

describe('GET /api/panels/diff', () => {
  it('404 when the flag is off', async () => {
    envMock.LONGITUDINAL_GRAPH_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 'u' });
    expect((await call('a', 'b')).status).toBe(404);
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    expect((await call('a', 'b')).status).toBe(401);
  });

  it('400 when from/to are missing', async () => {
    const userId = await makeTestUser(prisma, 'diff-missing');
    currentUserMock.mockResolvedValue({ id: userId });
    expect((await call(undefined, 'b')).status).toBe(400);
    expect((await call('a', undefined)).status).toBe(400);
  });

  it('400 when from === to (a panel cannot be diffed against itself)', async () => {
    const userId = await makeTestUser(prisma, 'diff-same');
    currentUserMock.mockResolvedValue({ id: userId });
    expect((await call('same-id', 'same-id')).status).toBe(400);
  });

  it('diffs two specific panels with the from-panel as baseline', async () => {
    const userId = await makeTestUser(prisma, 'diff-ok');
    currentUserMock.mockResolvedValue({ id: userId });
    const fromDoc = await ingestFerritin(userId, '2026-02-01', 18);
    const toDoc = await ingestFerritin(userId, '2026-06-01', 41);

    const res = await call(fromDoc, toDoc);
    expect(res.status).toBe(200);
    const { diff } = await res.json();
    expect(diff.previousPanelAt).toContain('2026-02-01');
    expect(diff.latestPanelAt).toContain('2026-06-01');
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({ marker: 'Ferritin', beforeValue: 18, afterValue: 41, classification: 'improved' });
  });

  it('404 when a panel id is not the caller’s (no cross-user leak)', async () => {
    const userId = await makeTestUser(prisma, 'diff-scope');
    const otherId = await makeTestUser(prisma, 'diff-other');
    const mine = await ingestFerritin(userId, '2026-02-01', 18);
    const theirs = await ingestFerritin(otherId, '2026-06-01', 41);
    currentUserMock.mockResolvedValue({ id: userId });

    const res = await call(mine, theirs); // `to` belongs to another user
    expect(res.status).toBe(404);
  });
});
