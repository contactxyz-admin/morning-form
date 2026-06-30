import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { buildOutcomeRationale, linkOutcomeChanged, type OutcomeForEdge } from './outcome-edges';

let prisma: PrismaClient;

beforeAll(async () => { prisma = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });

const baseOutcome: OutcomeForEdge = {
  actionId: 'act_abc123',
  label: 'Track iron-rich meals',
  markerName: 'Ferritin',
  beforeValue: 18,
  beforeAt: '2026-02-01T00:00:00.000Z',
  afterValue: 41,
  afterAt: '2026-06-01T00:00:00.000Z',
  acceptedAt: '2026-02-15T00:00:00.000Z',
};

describe('buildOutcomeRationale (pure)', () => {
  it('describes the movement without any causal verb', () => {
    const r = buildOutcomeRationale(baseOutcome);
    expect(r).toContain('Ferritin moved from 18 to 41');
    expect(r).toContain('temporal association, not a proven cause');
    expect(r).not.toMatch(/\b(caused|fixed|cured|because of)\b/i);
  });

  it('handles a single-reading outcome (no before value)', () => {
    const r = buildOutcomeRationale({ ...baseOutcome, beforeValue: null });
    expect(r).toContain('Ferritin was measured at 41');
    expect(r).not.toMatch(/\b(caused|fixed|cured)\b/i);
  });
});

async function seedFerritinConcept(userId: string): Promise<void> {
  await addNode(prisma, userId, {
    type: 'biomarker',
    canonicalKey: 'ferritin',
    displayName: 'Ferritin',
    attributes: { value: 18, unit: 'ug/L' },
  });
}

async function outcomeEdges(userId: string) {
  const edges = await prisma.graphEdge.findMany({ where: { userId, type: 'OUTCOME_CHANGED' } });
  return Promise.all(
    edges.map(async (e) => {
      const from = await prisma.graphNode.findUniqueOrThrow({ where: { id: e.fromNodeId } });
      const to = await prisma.graphNode.findUniqueOrThrow({ where: { id: e.toNodeId } });
      return {
        fromType: from.type,
        toCanonicalKey: to.canonicalKey,
        metadata: e.metadata ? JSON.parse(e.metadata) : null,
      };
    }),
  );
}

describe('linkOutcomeChanged', () => {
  it('creates an intervention_event and an OUTCOME_CHANGED edge to the marker concept', async () => {
    const userId = await makeTestUser(prisma, 'outcome-basic');
    await seedFerritinConcept(userId);

    const res = await linkOutcomeChanged(prisma, userId, baseOutcome);
    expect(res.created).toBe(true);

    const events = await prisma.graphNode.findMany({ where: { userId, type: 'intervention_event' } });
    expect(events).toHaveLength(1);
    expect(events[0].displayName).toBe('Track iron-rich meals');

    const links = await outcomeEdges(userId);
    expect(links).toHaveLength(1);
    expect(links[0].fromType).toBe('intervention_event');
    expect(links[0].toCanonicalKey).toBe('ferritin');
    expect(links[0].metadata).toMatchObject({
      observedFrom: '2026-02-01T00:00:00.000Z',
      observedTo: '2026-06-01T00:00:00.000Z',
    });
    expect(links[0].metadata.rationale).not.toMatch(/\b(caused|fixed|cured)\b/i);
  });

  it('skips cleanly when the marker concept cannot be resolved (no throw, outcome stays written)', async () => {
    const userId = await makeTestUser(prisma, 'outcome-noconcept');
    // No biomarker concept seeded.
    const res = await linkOutcomeChanged(prisma, userId, baseOutcome);
    expect(res).toEqual({ created: false, reason: 'no-biomarker-concept' });
    expect(await prisma.graphEdge.findMany({ where: { userId, type: 'OUTCOME_CHANGED' } })).toHaveLength(0);
    expect(await prisma.graphNode.findMany({ where: { userId, type: 'intervention_event' } })).toHaveLength(0);
  });

  it('resolves the concept case-insensitively by displayName (parity with the trajectory gate)', async () => {
    const userId = await makeTestUser(prisma, 'outcome-ci');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'hba1c',
      displayName: 'HbA1c',
      attributes: { value: 48, unit: 'mmol/mol' },
    });
    // markerName arrives lowercased — must still resolve (the outcome's
    // before/after were derived via the case-insensitive trajectory match).
    const res = await linkOutcomeChanged(prisma, userId, { ...baseOutcome, markerName: 'hba1c' });
    expect(res.created).toBe(true);
    expect((await outcomeEdges(userId))[0].toCanonicalKey).toBe('hba1c');
  });

  it('resolves a registry-aliased concept whose canonicalKey is NOT the slugified name', async () => {
    const userId = await makeTestUser(prisma, 'outcome-registry');
    // Concept keyed by the registry canonicalKey 'mcv'; slugify('Mean cell
    // volume') would be 'mean_cell_volume' and miss — the registry-alias
    // fallback must bridge it.
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'mcv',
      displayName: 'MCV',
      attributes: { value: 90, unit: 'fL' },
    });
    const res = await linkOutcomeChanged(prisma, userId, { ...baseOutcome, markerName: 'Mean cell volume' });
    expect(res.created).toBe(true);
    expect((await outcomeEdges(userId))[0].toCanonicalKey).toBe('mcv');
  });

  it('is idempotent — a second link creates nothing new', async () => {
    const userId = await makeTestUser(prisma, 'outcome-idempotent');
    await seedFerritinConcept(userId);

    expect((await linkOutcomeChanged(prisma, userId, baseOutcome)).created).toBe(true);
    expect((await linkOutcomeChanged(prisma, userId, baseOutcome)).created).toBe(false);

    expect(await prisma.graphNode.findMany({ where: { userId, type: 'intervention_event' } })).toHaveLength(1);
    expect(await prisma.graphEdge.findMany({ where: { userId, type: 'OUTCOME_CHANGED' } })).toHaveLength(1);
  });
});
