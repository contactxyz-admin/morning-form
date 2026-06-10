import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

async function ingestFerritinPanel(userId: string, date: string, value: number, flagged: boolean) {
  await ingestExtraction(prisma, userId, {
    document: {
      kind: 'lab_pdf',
      sourceRef: `panel-${date}.pdf`,
      contentHash: `hash-${date}`,
      capturedAt: new Date(date),
    },
    chunks: [{ index: 0, text: `Ferritin ${value}`, offsetStart: 0, offsetEnd: 10 }],
    nodes: [
      {
        type: 'biomarker',
        canonicalKey: 'ferritin',
        displayName: 'Ferritin',
        attributes: {
          value,
          unit: 'ug/L',
          referenceRangeLow: 30,
          referenceRangeHigh: 400,
          flaggedOutOfRange: flagged,
          collectionDate: date,
          latestValue: value,
          latestValueAt: new Date(date).toISOString(),
        },
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
      {
        type: 'INSTANCE_OF',
        fromType: 'observation',
        fromCanonicalKey: `obs_ferritin_${date.replace(/-/g, '_')}`,
        toType: 'biomarker',
        toCanonicalKey: 'ferritin',
      },
    ],
  });
}

describe('GET /api/markers/changes', () => {
  it('404 when the flag is off', async () => {
    envMock.LONGITUDINAL_GRAPH_ENABLED = '';
    const userId = await makeTestUser(prisma, 'changes-flagoff');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns { diff: null } for a user with no lab panels', async () => {
    const userId = await makeTestUser(prisma, 'changes-empty');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).diff).toBeNull();
  });

  it('returns the panel diff between the two most-recent panels', async () => {
    const userId = await makeTestUser(prisma, 'changes-diff');
    currentUserMock.mockResolvedValue({ id: userId });
    await ingestFerritinPanel(userId, '2026-04-01', 18, true);
    await ingestFerritinPanel(userId, '2026-06-01', 41, false);

    const res = await GET();
    expect(res.status).toBe(200);
    const { diff } = await res.json();
    expect(diff.previousPanelAt).toContain('2026-04-01');
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      marker: 'Ferritin',
      beforeValue: 18,
      afterValue: 41,
      direction: 'up',
      classification: 'improved',
    });
  });
});
