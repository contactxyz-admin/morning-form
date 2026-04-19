import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { compareToReferenceRangeHandler } from './compare-to-reference-range';
import type { ToolContext } from './types';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('compare_to_reference_range handler', () => {
  it('classifies a below-range ferritin reading', async () => {
    const userId = await makeTestUser(prisma, 'range-below');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: {
        latestValue: 12,
        referenceRangeLow: 15,
        referenceRangeHigh: 150,
        unit: 'ug/L',
      },
    });

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron' };
    const result = await compareToReferenceRangeHandler.execute(ctx, {
      canonicalKey: 'ferritin',
    });

    expect(result.found).toBe(true);
    expect(result.classification).toBe('below');
    expect(result.value).toBe(12);
    expect(result.range).toEqual({ low: 15, high: 150 });
    expect(result.unit).toBe('ug/L');
    expect(result.nodeId).toBeTruthy();
  });

  it('classifies an in-range reading', async () => {
    const userId = await makeTestUser(prisma, 'range-in');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'haemoglobin',
      displayName: 'Haemoglobin',
      attributes: {
        latestValue: 140,
        referenceRangeLow: 130,
        referenceRangeHigh: 175,
        unit: 'g/L',
      },
    });
    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron' };
    const result = await compareToReferenceRangeHandler.execute(ctx, {
      canonicalKey: 'haemoglobin',
    });
    expect(result.classification).toBe('in-range');
  });

  it('classifies an above-range reading', async () => {
    const userId = await makeTestUser(prisma, 'range-above');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: {
        latestValue: 320,
        referenceRangeLow: 15,
        referenceRangeHigh: 150,
      },
    });
    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron' };
    const result = await compareToReferenceRangeHandler.execute(ctx, {
      canonicalKey: 'ferritin',
    });
    expect(result.classification).toBe('above');
  });

  it('returns insufficient-data when value is present but range is missing', async () => {
    const userId = await makeTestUser(prisma, 'range-no-range');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { latestValue: 12 },
    });
    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron' };
    const result = await compareToReferenceRangeHandler.execute(ctx, {
      canonicalKey: 'ferritin',
    });
    expect(result.found).toBe(true);
    expect(result.classification).toBe('insufficient-data');
    expect(result.range).toBeNull();
  });

  it('returns not-found when the biomarker does not exist for the user', async () => {
    const userId = await makeTestUser(prisma, 'range-missing');
    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron' };
    const result = await compareToReferenceRangeHandler.execute(ctx, {
      canonicalKey: 'ferritin',
    });
    expect(result.found).toBe(false);
    expect(result.classification).toBe('not-found');
    expect(result.nodeId).toBeNull();
  });

  it('topic-scope gate: returns not-found for a canonicalKey outside the topic\'s patterns even when a node exists', async () => {
    // Regression (D10): the Iron scribe must not surface a testosterone reading
    // even if one exists on the graph for this user. The handler should not
    // query the DB at all — the topic scope gate short-circuits before the
    // findUnique. We verify by seeding the node and asserting the handler
    // reports not-found and nodeId === null.
    const userId = await makeTestUser(prisma, 'range-topic-scope');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'testosterone',
      displayName: 'Testosterone',
      attributes: { latestValue: 15, referenceRangeLow: 10, referenceRangeHigh: 30, unit: 'nmol/L' },
    });

    const ctx: ToolContext = { db: prisma, userId, topicKey: 'iron' };
    const result = await compareToReferenceRangeHandler.execute(ctx, {
      canonicalKey: 'testosterone',
    });
    expect(result.found).toBe(false);
    expect(result.classification).toBe('not-found');
    expect(result.nodeId).toBeNull();
    expect(result.value).toBeNull();
  });

  it('topic-scope gate: returns not-found when topicKey is unknown', async () => {
    const userId = await makeTestUser(prisma, 'range-unknown-topic');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { latestValue: 12, referenceRangeLow: 15, referenceRangeHigh: 150 },
    });
    const ctx: ToolContext = { db: prisma, userId, topicKey: 'nonsense-topic' };
    const result = await compareToReferenceRangeHandler.execute(ctx, {
      canonicalKey: 'ferritin',
    });
    expect(result.found).toBe(false);
    expect(result.classification).toBe('not-found');
  });

  it('does not return another user\'s biomarker', async () => {
    const userA = await makeTestUser(prisma, 'range-userA');
    const userB = await makeTestUser(prisma, 'range-userB');
    await addNode(prisma, userA, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { latestValue: 12, referenceRangeLow: 15, referenceRangeHigh: 150 },
    });
    const ctx: ToolContext = { db: prisma, userId: userB, topicKey: 'iron' };
    const result = await compareToReferenceRangeHandler.execute(ctx, {
      canonicalKey: 'ferritin',
    });
    expect(result.found).toBe(false);
    expect(result.classification).toBe('not-found');
  });
});
