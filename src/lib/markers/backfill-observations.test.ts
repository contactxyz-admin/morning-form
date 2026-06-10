import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode, ingestExtraction } from '@/lib/graph/mutations';
import { buildMarkerTrajectory } from './trajectory';
import { diffLatestPanels } from './panel-diff';
import { backfillObservationsForUser } from './backfill-observations';

let prisma: PrismaClient;
const originalLongitudinalFlag = process.env.LONGITUDINAL_GRAPH_ENABLED;

beforeAll(async () => { prisma = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });
beforeEach(() => {
  process.env.LONGITUDINAL_GRAPH_ENABLED = 'true';
});
afterEach(() => {
  if (originalLongitudinalFlag === undefined) delete process.env.LONGITUDINAL_GRAPH_ENABLED;
  else process.env.LONGITUDINAL_GRAPH_ENABLED = originalLongitudinalFlag;
});

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

  it('inherits SUPPORTS provenance so backfilled instances join their panel in the diff (rollout regression)', async () => {
    const userId = await makeTestUser(prisma, 'backfill-provenance');
    // PRE-FEATURE panel: ingested with a concept node only (the old write
    // path) — no observation instance.
    await ingestExtraction(prisma, userId, {
      document: {
        kind: 'lab_pdf',
        sourceRef: 'april.pdf',
        contentHash: 'hash-pre-feature',
        capturedAt: new Date('2026-04-01'),
      },
      chunks: [{ index: 0, text: 'Ferritin 18 ug/L (30-400) LOW', offsetStart: 0, offsetEnd: 28 }],
      nodes: [
        {
          type: 'biomarker',
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          attributes: {
            value: 18,
            unit: 'ug/L',
            referenceRangeLow: 30,
            referenceRangeHigh: 400,
            collectionDate: '2026-04-01',
          },
          supportingChunkIndices: [0],
        },
      ],
      edges: [],
    });

    // Backfill recovers the reading WITH provenance.
    const res = await backfillObservationsForUser(prisma, userId);
    expect(res.created).toBe(1);

    const instance = await prisma.graphNode.findUniqueOrThrow({
      where: {
        userId_type_canonicalKey: {
          userId, type: 'observation', canonicalKey: 'obs_ferritin_2026_04_01',
        },
      },
    });
    const supports = await prisma.graphEdge.findMany({
      where: { userId, type: 'SUPPORTS', fromNodeId: instance.id },
    });
    expect(supports).toHaveLength(1);
    expect(supports[0].fromDocumentId).toBeTruthy();
    expect(supports[0].fromChunkId).toBeTruthy();

    // POST-FEATURE re-test: new panel arrives via the new write path
    // (concept + instance + SUPPORTS).
    const measuredAt = new Date('2026-06-01').toISOString();
    await ingestExtraction(prisma, userId, {
      document: {
        kind: 'lab_pdf',
        sourceRef: 'june.pdf',
        contentHash: 'hash-post-feature',
        capturedAt: new Date('2026-06-01'),
      },
      chunks: [{ index: 0, text: 'Ferritin 41 ug/L (30-400)', offsetStart: 0, offsetEnd: 25 }],
      nodes: [
        {
          type: 'biomarker',
          canonicalKey: 'ferritin',
          displayName: 'Ferritin',
          attributes: {
            value: 41,
            unit: 'ug/L',
            collectionDate: '2026-06-01',
            latestValue: 41,
            latestValueAt: measuredAt,
          },
          supportingChunkIndices: [0],
        },
        {
          type: 'observation',
          canonicalKey: 'obs_ferritin_2026_06_01',
          displayName: 'Ferritin · 2026-06-01',
          attributes: { value: 41, unit: 'ug/L', measuredAt },
          promoted: false,
          supportingChunkIndices: [0],
        },
      ],
      edges: [
        {
          type: 'INSTANCE_OF',
          fromType: 'observation',
          fromCanonicalKey: 'obs_ferritin_2026_06_01',
          toType: 'biomarker',
          toCanonicalKey: 'ferritin',
        },
      ],
    });

    // THE rollout moment: the diff sees before AND after — not all-'new'.
    const diff = await diffLatestPanels(prisma, userId);
    expect(diff?.previousPanelAt).toContain('2026-04-01');
    expect(diff?.changes).toHaveLength(1);
    expect(diff?.changes[0]).toMatchObject({
      marker: 'Ferritin',
      beforeValue: 18,
      afterValue: 41,
      classification: 'improved',
    });
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
