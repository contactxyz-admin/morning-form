import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { ingestExtraction } from '@/lib/graph/mutations';
import type { IngestExtractionInput } from '@/lib/graph/types';
import { linkTemporalSucceedsForUser, orderObservationPairs } from './temporal-succeeds';

let prisma: PrismaClient;

beforeAll(async () => { prisma = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });

describe('orderObservationPairs (pure)', () => {
  it('links consecutive readings earlier → later, regardless of input order', () => {
    const pairs = orderObservationPairs([
      { id: 'c', measuredAt: '2026-06-01' },
      { id: 'a', measuredAt: '2026-02-01' },
      { id: 'b', measuredAt: '2026-04-01' },
    ]);
    expect(pairs).toEqual([
      { fromNodeId: 'a', toNodeId: 'b' },
      { fromNodeId: 'b', toNodeId: 'c' },
    ]);
  });

  it('returns no pairs for a single reading', () => {
    expect(orderObservationPairs([{ id: 'a', measuredAt: '2026-02-01' }])).toEqual([]);
  });

  it('returns no pairs for an empty list', () => {
    expect(orderObservationPairs([])).toEqual([]);
  });

  it('drops readings with an unparseable date', () => {
    const pairs = orderObservationPairs([
      { id: 'a', measuredAt: '2026-02-01' },
      { id: 'bad', measuredAt: 'not-a-date' },
      { id: 'b', measuredAt: '2026-04-01' },
    ]);
    expect(pairs).toEqual([{ fromNodeId: 'a', toNodeId: 'b' }]);
  });

  it('breaks exact-tie instants deterministically by id', () => {
    const pairs = orderObservationPairs([
      { id: 'z', measuredAt: '2026-02-01T00:00:00Z' },
      { id: 'a', measuredAt: '2026-02-01T00:00:00Z' },
    ]);
    expect(pairs).toEqual([{ fromNodeId: 'a', toNodeId: 'z' }]);
  });
});

/** Seed one dated observation instance of a marker via the real ingest path. */
async function ingestReading(
  userId: string,
  marker: { key: string; display: string },
  value: number,
  date: string,
): Promise<void> {
  const measuredAt = new Date(date).toISOString();
  const obsKey = `obs_${marker.key}_${date.replace(/-/g, '_')}`;
  const input: IngestExtractionInput = {
    document: {
      kind: 'lab_pdf',
      sourceRef: `${date}.pdf`,
      contentHash: `hash-${marker.key}-${date}`,
      capturedAt: new Date(date),
    },
    chunks: [{ index: 0, text: `${marker.display} ${value}`, offsetStart: 0, offsetEnd: 10 }],
    nodes: [
      {
        type: 'biomarker',
        canonicalKey: marker.key,
        displayName: marker.display,
        attributes: { value, unit: 'ug/L', collectionDate: date, latestValue: value, latestValueAt: measuredAt },
        supportingChunkIndices: [0],
      },
      {
        type: 'observation',
        canonicalKey: obsKey,
        displayName: `${marker.display} · ${date}`,
        attributes: { value, unit: 'ug/L', measuredAt },
        promoted: false,
        supportingChunkIndices: [0],
      },
    ],
    edges: [
      { type: 'INSTANCE_OF', fromType: 'observation', fromCanonicalKey: obsKey, toType: 'biomarker', toCanonicalKey: marker.key },
    ],
  };
  await ingestExtraction(prisma, userId, input);
}

async function temporalEdges(userId: string) {
  const edges = await prisma.graphEdge.findMany({ where: { userId, type: 'TEMPORAL_SUCCEEDS' } });
  const byNode = async (id: string) =>
    (await prisma.graphNode.findUniqueOrThrow({ where: { id } })).canonicalKey;
  return Promise.all(
    edges.map(async (e) => ({ from: await byNode(e.fromNodeId), to: await byNode(e.toNodeId) })),
  );
}

describe('linkTemporalSucceedsForUser', () => {
  const ferritin = { key: 'ferritin', display: 'Ferritin' };

  it('links three draws into two consecutive edges, none skipping', async () => {
    const userId = await makeTestUser(prisma, 'temporal-three');
    await ingestReading(userId, ferritin, 18, '2026-02-01');
    await ingestReading(userId, ferritin, 41, '2026-04-01');
    await ingestReading(userId, ferritin, 62, '2026-06-01');

    const res = await linkTemporalSucceedsForUser(prisma, userId);
    expect(res.created).toBe(2);

    const links = await temporalEdges(userId);
    expect(links).toEqual(
      expect.arrayContaining([
        { from: 'obs_ferritin_2026_02_01', to: 'obs_ferritin_2026_04_01' },
        { from: 'obs_ferritin_2026_04_01', to: 'obs_ferritin_2026_06_01' },
      ]),
    );
    expect(links).toHaveLength(2);
  });

  it('creates no edge for a single draw', async () => {
    const userId = await makeTestUser(prisma, 'temporal-single');
    await ingestReading(userId, ferritin, 18, '2026-02-01');
    const res = await linkTemporalSucceedsForUser(prisma, userId);
    expect(res.created).toBe(0);
    expect(await temporalEdges(userId)).toHaveLength(0);
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const userId = await makeTestUser(prisma, 'temporal-idempotent');
    await ingestReading(userId, ferritin, 18, '2026-02-01');
    await ingestReading(userId, ferritin, 41, '2026-04-01');

    expect((await linkTemporalSucceedsForUser(prisma, userId)).created).toBe(1);
    expect((await linkTemporalSucceedsForUser(prisma, userId)).created).toBe(0);
    expect(await temporalEdges(userId)).toHaveLength(1);
  });

  it('does not cross-link different markers', async () => {
    const userId = await makeTestUser(prisma, 'temporal-multi');
    await ingestReading(userId, ferritin, 18, '2026-02-01');
    await ingestReading(userId, ferritin, 41, '2026-04-01');
    await ingestReading(userId, { key: 'vitamin_d', display: 'Vitamin D' }, 50, '2026-03-01');

    await linkTemporalSucceedsForUser(prisma, userId);
    const links = await temporalEdges(userId);
    // Only the two ferritin readings link; the lone vitamin D reading does not.
    expect(links).toEqual([
      { from: 'obs_ferritin_2026_02_01', to: 'obs_ferritin_2026_04_01' },
    ]);
  });

  it('reconciles an out-of-order (backdated) panel — prunes the stale skip-edge', async () => {
    const userId = await makeTestUser(prisma, 'temporal-backdated');
    // Two panels arrive in order Feb then Jun → Feb→Jun.
    await ingestReading(userId, ferritin, 18, '2026-02-01');
    await ingestReading(userId, ferritin, 62, '2026-06-01');
    await linkTemporalSucceedsForUser(prisma, userId);
    expect(await temporalEdges(userId)).toEqual([
      { from: 'obs_ferritin_2026_02_01', to: 'obs_ferritin_2026_06_01' },
    ]);

    // A backdated Apr reading lands between them; re-link must converge to the
    // Feb→Apr→Jun chain and DELETE the now-stale Feb→Jun skip-edge.
    await ingestReading(userId, ferritin, 41, '2026-04-01');
    const res = await linkTemporalSucceedsForUser(prisma, userId);
    expect(res.created).toBe(2); // Feb→Apr, Apr→Jun

    const links = await temporalEdges(userId);
    expect(links).toEqual(
      expect.arrayContaining([
        { from: 'obs_ferritin_2026_02_01', to: 'obs_ferritin_2026_04_01' },
        { from: 'obs_ferritin_2026_04_01', to: 'obs_ferritin_2026_06_01' },
      ]),
    );
    expect(links).toHaveLength(2);
    expect(links).not.toContainEqual({ from: 'obs_ferritin_2026_02_01', to: 'obs_ferritin_2026_06_01' });
  });

  it('honours conceptCanonicalKeys scoping (the lab-ingest hot path)', async () => {
    const userId = await makeTestUser(prisma, 'temporal-scoped');
    await ingestReading(userId, ferritin, 18, '2026-02-01');
    await ingestReading(userId, ferritin, 41, '2026-04-01');
    await ingestReading(userId, { key: 'vitamin_d', display: 'Vitamin D' }, 50, '2026-03-01');
    await ingestReading(userId, { key: 'vitamin_d', display: 'Vitamin D' }, 70, '2026-05-01');

    // Scope to ferritin only — vitamin D's pair must NOT be created.
    const res = await linkTemporalSucceedsForUser(prisma, userId, { conceptCanonicalKeys: ['ferritin'] });
    expect(res.created).toBe(1);
    const links = await temporalEdges(userId);
    expect(links).toEqual([
      { from: 'obs_ferritin_2026_02_01', to: 'obs_ferritin_2026_04_01' },
    ]);
  });
});
