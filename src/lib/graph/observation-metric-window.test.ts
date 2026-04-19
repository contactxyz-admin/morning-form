import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { addNode } from './mutations';
import { getSubgraphForTopic } from './queries';
import { NodeAttributesValidationError } from './errors';
import {
  resolveVitalSign,
  VITAL_SIGNS_CANONICAL_KEYS,
  validateAttributesForWrite,
} from './attributes';
import { makeTestUser, setupTestDb, teardownTestDb } from './test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('T4 observation node type', () => {
  it('round-trips a registry-backed observation write', async () => {
    const userId = await makeTestUser(prisma, 't4-obs-happy');
    const { id, created } = await addNode(prisma, userId, {
      type: 'observation',
      canonicalKey: 'bp_systolic',
      displayName: 'Systolic BP',
      attributes: {
        value: 124,
        unit: 'mmHg',
        measuredAt: '2026-03-15T09:00:00Z',
        context: 'home',
      },
    });
    expect(created).toBe(true);
    const row = await prisma.graphNode.findUnique({ where: { id } });
    const attrs = JSON.parse(row!.attributes!);
    expect(attrs).toMatchObject({ value: 124, unit: 'mmHg', context: 'home' });
  });

  it('accepts an unknown canonical key — registry is advisory, not enforcing', async () => {
    const userId = await makeTestUser(prisma, 't4-obs-unregistered');
    const { id } = await addNode(prisma, userId, {
      type: 'observation',
      canonicalKey: 'grip_strength_right_hand',
      displayName: 'Grip strength (right hand)',
      attributes: { value: 38, unit: 'kg', measuredAt: '2026-03-15T09:00:00Z' },
    });
    const row = await prisma.graphNode.findUnique({ where: { id } });
    expect(row?.canonicalKey).toBe('grip_strength_right_hand');
    expect(resolveVitalSign('grip_strength_right_hand')).toBeUndefined();
  });

  it('rejects an unknown observation context value (strict enum)', () => {
    expect(() =>
      validateAttributesForWrite('observation', 'pulse_resting', {
        value: 58,
        unit: 'bpm',
        measuredAt: '2026-03-15T09:00:00Z',
        context: 'telepathic' as unknown as 'wearable',
      }),
    ).toThrow(NodeAttributesValidationError);
  });
});

describe('T4 vital-signs registry', () => {
  it('resolves by canonical key, display name, and alias', () => {
    expect(resolveVitalSign('bp_systolic')?.unit).toBe('mmHg');
    expect(resolveVitalSign('Systolic BP')?.canonicalKey).toBe('bp_systolic');
    expect(resolveVitalSign('rhr')?.canonicalKey).toBe('pulse_resting');
    expect(resolveVitalSign('body mass index')?.canonicalKey).toBe('bmi');
  });

  it('returns undefined for unknown vitals', () => {
    expect(resolveVitalSign('esoteric_vital')).toBeUndefined();
  });

  it('exposes a canonical-key set for membership checks', () => {
    expect(VITAL_SIGNS_CANONICAL_KEYS.has('bp_diastolic')).toBe(true);
    expect(VITAL_SIGNS_CANONICAL_KEYS.has('not_a_vital')).toBe(false);
  });
});

describe('T4 metric_window contract', () => {
  const validBase = {
    metric: 'hrv',
    windowStartAt: '2026-04-01T00:00:00Z',
    windowEndAt: '2026-04-08T00:00:00Z',
    aggregation: 'mean' as const,
    n: 7,
    value: 48,
    unit: 'ms',
  };

  it('accepts a valid hrv 7-day window', () => {
    expect(() => validateAttributesForWrite('metric_window', 'hrv-7d', validBase)).not.toThrow();
  });

  it('accepts both canonical and alias metric names', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'hrv-7d', {
        ...validBase,
        metric: 'heart_rate_variability_rmssd',
      }),
    ).not.toThrow();
  });

  it('rejects an unknown metric name', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'bogus-7d', {
        ...validBase,
        metric: 'vibes_index',
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('rejects aggregation: percentile (not in enum)', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'hrv-7d', {
        ...validBase,
        aggregation: 'percentile' as unknown as 'mean',
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('rejects windowEndAt before windowStartAt', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'hrv-7d', {
        ...validBase,
        windowStartAt: '2026-04-08T00:00:00Z',
        windowEndAt: '2026-04-01T00:00:00Z',
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('rejects non-ISO windowStartAt', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'hrv-7d', {
        ...validBase,
        windowStartAt: 'last tuesday',
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('rejects DD/MM/YYYY even though Date.parse may accept it', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'hrv-7d', {
        ...validBase,
        windowStartAt: '01/05/2026',
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('rejects a calendar-invalid date whose shape matches the regex (e.g. Feb 30)', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'hrv-7d', {
        ...validBase,
        windowStartAt: '2026-02-30T00:00:00Z',
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('rejects a month-13 date (shape-valid, not a real calendar month)', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'hrv-7d', {
        ...validBase,
        windowStartAt: '2026-13-01T00:00:00Z',
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('accepts an ISO datetime with a sub-second and timezone offset', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'hrv-7d', {
        ...validBase,
        windowStartAt: '2026-04-01T00:00:00.123+01:00',
      }),
    ).not.toThrow();
  });

  it('rejects unknown fields (strict)', () => {
    expect(() =>
      validateAttributesForWrite('metric_window', 'hrv-7d', { ...validBase, bogus: true }),
    ).toThrow(NodeAttributesValidationError);
  });
});

describe('T4 subgraph retrieval isolates observations from biomarkers', () => {
  it('relevantNodeTypes=[observation] returns observations but not biomarkers', async () => {
    const userId = await makeTestUser(prisma, 't4-subgraph-obs');
    await addNode(prisma, userId, {
      type: 'observation',
      canonicalKey: 'bp_systolic',
      displayName: 'Systolic BP',
      attributes: { value: 128, unit: 'mmHg', measuredAt: '2026-03-15T09:00:00Z' },
    });
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });
    const sub = await getSubgraphForTopic(prisma, userId, {
      types: ['observation'],
      canonicalKeyPatterns: ['bp_systolic'],
      depth: 1,
    });
    expect(sub.nodes.every((n) => n.type === 'observation')).toBe(true);
    expect(sub.nodes.some((n) => n.canonicalKey === 'bp_systolic')).toBe(true);
    expect(sub.nodes.some((n) => n.canonicalKey === 'ferritin')).toBe(false);
  });
});
