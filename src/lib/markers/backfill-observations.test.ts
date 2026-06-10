import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { buildMarkerTrajectory } from './trajectory';
import { backfillObservationsForUser } from './backfill-observations';

let prisma: PrismaClient;
beforeAll(async () => { prisma = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });

describe('backfillObservationsForUser', () => {
  it('creates one dated instance per pre-migration biomarker concept and makes it trajectory-readable', async () => {
    const userId = await makeTestUser(prisma, 'backfill-basic');
    // A pre-migration concept: value + collectionDate, no instance.
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { value: 18, unit: 'ug/L', collectionDate: '2026-04-01' },
    });

    const res = await backfillObservationsForUser(prisma, userId);
    expect(res).toMatchObject({ scanned: 1, created: 1, skipped: 0 });

    const instances = await prisma.graphNode.findMany({ where: { userId, type: 'observation' } });
    expect(instances.map((n) => n.canonicalKey)).toEqual(['obs_ferritin_2026_04_01']);

    // Now the trajectory reader returns the recovered point.
    const pts = await buildMarkerTrajectory(prisma, userId, 'Ferritin');
    expect(pts).toHaveLength(1);
    expect(pts[0].value).toBe(18);
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const userId = await makeTestUser(prisma, 'backfill-idempotent');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'hba1c',
      displayName: 'HbA1c',
      attributes: { value: 48, unit: 'mmol/mol', collectionDate: '2026-04-01' },
    });

    const first = await backfillObservationsForUser(prisma, userId);
    expect(first.created).toBe(1);
    const second = await backfillObservationsForUser(prisma, userId);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);

    const instances = await prisma.graphNode.findMany({ where: { userId, type: 'observation' } });
    expect(instances).toHaveLength(1);
  });

  it('skips concepts with no value or no date', async () => {
    const userId = await makeTestUser(prisma, 'backfill-skip');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'tsh',
      displayName: 'TSH',
      attributes: { unit: 'mU/L' }, // no value, no date
    });

    const res = await backfillObservationsForUser(prisma, userId);
    expect(res).toMatchObject({ scanned: 1, created: 0, skipped: 1 });
    const instances = await prisma.graphNode.findMany({ where: { userId, type: 'observation' } });
    expect(instances).toHaveLength(0);
  });
});
