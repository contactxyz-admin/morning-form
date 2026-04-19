import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { addEdge, addNode } from './mutations';
import { EdgeEndpointViolation } from './errors';
import { EDGE_ENDPOINT_RULES, assertEdgeEndpoints } from './edge-validation';
import { EDGE_TYPES } from './types';
import { makeTestUser, setupTestDb, teardownTestDb } from './test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('T8 edge-endpoint rule table', () => {
  it('covers every EdgeType (exhaustive)', () => {
    for (const edgeType of EDGE_TYPES) {
      expect(EDGE_ENDPOINT_RULES).toHaveProperty(edgeType);
    }
  });

  it('SUPPORTS / ASSOCIATED_WITH / CAUSES / CONTRADICTS / TEMPORAL_SUCCEEDS are unrestricted', () => {
    for (const edgeType of ['SUPPORTS', 'ASSOCIATED_WITH', 'CAUSES', 'CONTRADICTS', 'TEMPORAL_SUCCEEDS'] as const) {
      expect(EDGE_ENDPOINT_RULES[edgeType].validFromTypes).toBeNull();
      expect(EDGE_ENDPOINT_RULES[edgeType].validToTypes).toBeNull();
    }
  });

  it('INSTANCE_OF accepts intervention_event → intervention/medication/lifestyle and symptom_episode → symptom/mood/energy', () => {
    expect(() => assertEdgeEndpoints('INSTANCE_OF', 'intervention_event', 'medication')).not.toThrow();
    expect(() => assertEdgeEndpoints('INSTANCE_OF', 'intervention_event', 'intervention')).not.toThrow();
    expect(() => assertEdgeEndpoints('INSTANCE_OF', 'intervention_event', 'lifestyle')).not.toThrow();
    expect(() => assertEdgeEndpoints('INSTANCE_OF', 'symptom_episode', 'symptom')).not.toThrow();
    expect(() => assertEdgeEndpoints('INSTANCE_OF', 'symptom_episode', 'mood')).not.toThrow();
    expect(() => assertEdgeEndpoints('INSTANCE_OF', 'symptom_episode', 'energy')).not.toThrow();
    expect(() => assertEdgeEndpoints('INSTANCE_OF', 'intervention_event', 'biomarker')).toThrow(
      EdgeEndpointViolation,
    );
    expect(() => assertEdgeEndpoints('INSTANCE_OF', 'symptom_episode', 'biomarker')).toThrow(
      EdgeEndpointViolation,
    );
    expect(() => assertEdgeEndpoints('INSTANCE_OF', 'medication', 'medication')).toThrow(
      EdgeEndpointViolation,
    );
  });

  it('OUTCOME_CHANGED only accepts intervention_event → measurable nodes', () => {
    expect(() => assertEdgeEndpoints('OUTCOME_CHANGED', 'intervention_event', 'symptom')).not.toThrow();
    expect(() => assertEdgeEndpoints('OUTCOME_CHANGED', 'intervention_event', 'biomarker')).not.toThrow();
    expect(() => assertEdgeEndpoints('OUTCOME_CHANGED', 'intervention_event', 'observation')).not.toThrow();
    expect(() => assertEdgeEndpoints('OUTCOME_CHANGED', 'intervention_event', 'metric_window')).not.toThrow();
    expect(() => assertEdgeEndpoints('OUTCOME_CHANGED', 'intervention_event', 'medication')).toThrow(
      EdgeEndpointViolation,
    );
    expect(() => assertEdgeEndpoints('OUTCOME_CHANGED', 'biomarker', 'symptom')).toThrow(
      EdgeEndpointViolation,
    );
  });
});

describe('T8 intervention_event end-to-end', () => {
  it('writes INSTANCE_OF from intervention_event to medication via addEdge', async () => {
    const userId = await makeTestUser(prisma, 't8-instance-of-ok');
    const { id: medId } = await addNode(prisma, userId, {
      type: 'medication',
      canonicalKey: 'atorvastatin',
      displayName: 'Atorvastatin',
    });
    const { id: eventId } = await addNode(prisma, userId, {
      type: 'intervention_event',
      canonicalKey: 'intervention_event_atorvastatin_2026_03_14',
      displayName: 'Atorvastatin dose taken',
      attributes: {
        eventKind: 'taken_as_prescribed',
        occurredAt: '2026-03-14T08:00:00Z',
        selfReportedCompliance: 1,
      },
    });
    const edgeId = await addEdge(prisma, userId, {
      type: 'INSTANCE_OF',
      fromNodeId: eventId,
      toNodeId: medId,
    });
    expect(edgeId).toBeTruthy();
    const row = await prisma.graphEdge.findUnique({ where: { id: edgeId } });
    expect(row?.type).toBe('INSTANCE_OF');
  });

  it('rejects INSTANCE_OF from intervention_event to biomarker', async () => {
    const userId = await makeTestUser(prisma, 't8-instance-of-bad');
    const { id: biomarkerId } = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ldl_cholesterol',
      displayName: 'LDL cholesterol',
    });
    const { id: eventId } = await addNode(prisma, userId, {
      type: 'intervention_event',
      canonicalKey: 'intervention_event_ldl_2026_03_14',
      displayName: 'Dose taken',
      attributes: { eventKind: 'taken_as_prescribed', occurredAt: '2026-03-14T08:00:00Z' },
    });
    await expect(() =>
      addEdge(prisma, userId, {
        type: 'INSTANCE_OF',
        fromNodeId: eventId,
        toNodeId: biomarkerId,
      }),
    ).rejects.toBeInstanceOf(EdgeEndpointViolation);
  });

  it('accepts OUTCOME_CHANGED intervention_event → symptom with metadata', async () => {
    const userId = await makeTestUser(prisma, 't8-outcome-ok');
    const { id: symptomId } = await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'headache',
      displayName: 'Headache',
    });
    const { id: eventId } = await addNode(prisma, userId, {
      type: 'intervention_event',
      canonicalKey: 'intervention_event_paracetamol_2026_03_20',
      displayName: 'Paracetamol dose',
      attributes: { eventKind: 'taken_as_prescribed', occurredAt: '2026-03-20T09:00:00Z' },
    });
    const edgeId = await addEdge(prisma, userId, {
      type: 'OUTCOME_CHANGED',
      fromNodeId: eventId,
      toNodeId: symptomId,
      weight: 0.6,
      metadata: {
        beforeValue: 7,
        afterValue: 3,
        effectiveDate: '2026-03-20',
        confidence: 'user_reported',
      },
    });
    const row = await prisma.graphEdge.findUnique({ where: { id: edgeId } });
    expect(row?.type).toBe('OUTCOME_CHANGED');
    expect(row?.weight).toBeCloseTo(0.6);
    expect(JSON.parse(row!.metadata!)).toMatchObject({ beforeValue: 7, afterValue: 3 });
  });

  it('rejects OUTCOME_CHANGED from biomarker to symptom', async () => {
    const userId = await makeTestUser(prisma, 't8-outcome-bad-from');
    const { id: biomarkerId } = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });
    const { id: symptomId } = await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
    });
    await expect(() =>
      addEdge(prisma, userId, {
        type: 'OUTCOME_CHANGED',
        fromNodeId: biomarkerId,
        toNodeId: symptomId,
      }),
    ).rejects.toBeInstanceOf(EdgeEndpointViolation);
  });
});
