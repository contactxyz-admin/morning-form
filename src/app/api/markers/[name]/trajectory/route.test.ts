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

async function ingestFerritin(userId: string, date: string, value: number): Promise<void> {
  await ingestExtraction(prisma, userId, {
    document: { kind: 'lab_pdf', sourceRef: `p-${date}.pdf`, contentHash: `hash-${date}`, capturedAt: new Date(date) },
    chunks: [{ index: 0, text: `Ferritin ${value}`, offsetStart: 0, offsetEnd: 10 }],
    nodes: [
      {
        type: 'biomarker',
        canonicalKey: 'ferritin',
        displayName: 'Ferritin',
        attributes: { value, unit: 'ug/L', collectionDate: date, latestValue: value, latestValueAt: new Date(date).toISOString() },
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
}

function call(name: string): Promise<Response> {
  return GET(new Request('http://localhost/api/markers/x/trajectory'), { params: { name } });
}

describe('GET /api/markers/[name]/trajectory', () => {
  it('404 when the flag is off', async () => {
    envMock.LONGITUDINAL_GRAPH_ENABLED = '';
    currentUserMock.mockResolvedValue({ id: 'u' });
    expect((await call('Ferritin')).status).toBe(404);
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    expect((await call('Ferritin')).status).toBe(401);
  });

  it('returns an empty series for an unknown marker', async () => {
    const userId = await makeTestUser(prisma, 'traj-empty');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await call('Ferritin');
    expect(res.status).toBe(200);
    expect((await res.json()).series).toEqual([]);
  });

  it('returns a multi-point dated series (newest first) for a marker with several draws', async () => {
    const userId = await makeTestUser(prisma, 'traj-multi');
    currentUserMock.mockResolvedValue({ id: userId });
    await ingestFerritin(userId, '2026-02-01', 18);
    await ingestFerritin(userId, '2026-04-01', 41);
    await ingestFerritin(userId, '2026-06-01', 62);

    const res = await call('Ferritin');
    expect(res.status).toBe(200);
    const { marker, series } = await res.json();
    expect(marker).toBe('Ferritin');
    expect(series).toHaveLength(3);
    expect(series.map((p: { value: number }) => p.value)).toEqual([62, 41, 18]); // newest first
  });

  it('decodes a URL-encoded marker name and scopes to the caller', async () => {
    const userId = await makeTestUser(prisma, 'traj-scope');
    const otherId = await makeTestUser(prisma, 'traj-other');
    await ingestFerritin(otherId, '2026-02-01', 99); // another user's data
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await call(encodeURIComponent('Ferritin'));
    expect(res.status).toBe(200);
    expect((await res.json()).series).toEqual([]); // never leaks the other user's series
  });
});
