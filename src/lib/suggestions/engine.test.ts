import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Engine characterization. We mock `@/lib/db` to exercise the engine's
 * orchestration contract without requiring a real SQLite fixture: point
 * fetch → evaluateRules → stale delete + upsert → returned shape.
 */

const findManyPoints = vi.fn();
const deleteManySuggestions = vi.fn().mockResolvedValue({ count: 0 });
const upsertSuggestion = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    healthDataPoint: {
      findMany: (args: unknown) => findManyPoints(args),
    },
    suggestion: {
      deleteMany: (args: unknown) => deleteManySuggestions(args),
      upsert: (args: unknown) => upsertSuggestion(args),
    },
  },
}));

import { ensureTodaysSuggestions, todayUtcMidnight } from './engine';

const NOW = new Date('2026-04-15T12:00:00Z');
const TODAY = todayUtcMidnight(NOW);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    provider: 'whoop',
    category: 'recovery',
    metric: 'recovery_score',
    value: 30,
    unit: '%',
    timestamp: new Date('2026-04-15T08:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  findManyPoints.mockReset();
  deleteManySuggestions.mockReset().mockResolvedValue({ count: 0 });
  upsertSuggestion.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ensureTodaysSuggestions', () => {
  it('creates a Suggestion row when a rule fires', async () => {
    findManyPoints.mockResolvedValue([row({ value: 30 })]);
    upsertSuggestion.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      date: TODAY,
      kind: 'recovery_low',
      title: 'Prioritise recovery today — consider a lighter session and an earlier bedtime',
      tier: 'moderate',
      triggeringMetricIds: JSON.stringify(['p1']),
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await ensureTodaysSuggestions('u1', NOW);

    expect(upsertSuggestion).toHaveBeenCalledTimes(1);
    const call = upsertSuggestion.mock.calls[0][0] as {
      where: { userId_date_kind: { userId: string; date: Date; kind: string } };
      create: { title: string; tier: string; triggeringMetricIds: string };
    };
    expect(call.where.userId_date_kind).toEqual({ userId: 'u1', date: TODAY, kind: 'recovery_low' });
    expect(call.create.triggeringMetricIds).toBe(JSON.stringify(['p1']));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'recovery_low',
      tier: 'moderate',
      triggeringMetricIds: ['p1'],
    });
  });

  it('deletes stale today-rows whose kinds no longer fire, scoped to user + today', async () => {
    findManyPoints.mockResolvedValue([row({ value: 30 })]);
    upsertSuggestion.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      date: TODAY,
      kind: 'recovery_low',
      title: 'x',
      tier: 'moderate',
      triggeringMetricIds: '[]',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await ensureTodaysSuggestions('u1', NOW);

    expect(deleteManySuggestions).toHaveBeenCalledTimes(1);
    const args = deleteManySuggestions.mock.calls[0][0] as {
      where: { userId: string; date: Date; kind: { notIn: string[] } };
    };
    expect(args.where.userId).toBe('u1');
    expect(args.where.date).toEqual(TODAY);
    expect(args.where.kind.notIn).toEqual(['recovery_low']);
  });

  it('returns empty and persists nothing when no rules fire', async () => {
    findManyPoints.mockResolvedValue([row({ value: 80 })]);

    const result = await ensureTodaysSuggestions('u1', NOW);

    expect(result).toEqual([]);
    expect(upsertSuggestion).not.toHaveBeenCalled();
    // Stale-cleanup still runs so previously-firing kinds get cleared.
    expect(deleteManySuggestions).toHaveBeenCalledTimes(1);
    const args = deleteManySuggestions.mock.calls[0][0] as {
      where: { kind: { notIn: string[] } };
    };
    expect(args.where.kind.notIn).toEqual([]);
  });

  it('fetches a 35-day baseline lookback window of points', async () => {
    findManyPoints.mockResolvedValue([]);

    await ensureTodaysSuggestions('u1', NOW);

    const call = findManyPoints.mock.calls[0][0] as {
      where: { userId: string; timestamp: { gte: Date } };
    };
    expect(call.where.userId).toBe('u1');
    const gte = call.where.timestamp.gte;
    // Widened from 7 to 35 days so personal-baseline rules have ≥30 days of
    // history; threshold rules still only see the recent 7-day slice.
    const expected = new Date(TODAY.getTime() - 35 * 24 * 60 * 60 * 1000);
    expect(gte.getTime()).toBe(expected.getTime());
  });

  it('persists a resting_hr_above_baseline row when a fresh RHR spike clears the personal baseline', async () => {
    // 30 flat days at 55 bpm (std small) then a fresh spike to 80 bpm.
    const rows: Record<string, unknown>[] = [];
    for (let i = 34; i >= 1; i--) {
      const ts = new Date(NOW.getTime() - i * 24 * 60 * 60 * 1000);
      // Alternate 54/56 so std30 > 0 but small; median ≈ 55.
      rows.push(
        row({
          id: `rhr-${i}`,
          category: 'heart',
          metric: 'resting_hr',
          value: i % 2 === 0 ? 54 : 56,
          unit: 'bpm',
          timestamp: ts,
        }),
      );
    }
    rows.push(
      row({
        id: 'rhr-today',
        category: 'heart',
        metric: 'resting_hr',
        value: 80,
        unit: 'bpm',
        timestamp: new Date(NOW.getTime() - 60 * 1000), // 1 min ago → fresh
      }),
    );
    findManyPoints.mockResolvedValue(rows);
    upsertSuggestion.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      date: TODAY,
      kind: 'resting_hr_above_baseline',
      title:
        'Your resting heart rate is running above your recent baseline — consider extra rest, hydration, and easing off hard training until it settles',
      tier: 'moderate',
      triggeringMetricIds: JSON.stringify(['rhr-today']),
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await ensureTodaysSuggestions('u1', NOW);

    const kinds = result.map((r) => r.kind);
    expect(kinds).toContain('resting_hr_above_baseline');
    const call = upsertSuggestion.mock.calls.find(
      (c) => (c[0] as { where: { userId_date_kind: { kind: string } } }).where.userId_date_kind.kind === 'resting_hr_above_baseline',
    );
    expect(call).toBeDefined();
    expect((call![0] as { create: { triggeringMetricIds: string } }).create.triggeringMetricIds).toBe(
      JSON.stringify(['rhr-today']),
    );
  });

  it('persists a glucose_fasting_diabetic row when a fasting 130 mg/dL reading lands', async () => {
    findManyPoints.mockResolvedValue([
      row({
        id: 'g1',
        provider: 'libre',
        category: 'metabolic',
        metric: 'glucose',
        value: 130,
        unit: 'mg/dL',
        timestamp: new Date('2026-04-15T06:00:00Z'),
      }),
    ]);
    upsertSuggestion.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      date: TODAY,
      kind: 'glucose_fasting_diabetic',
      title:
        'Please consult a clinician — morning-form should not be your primary intervention here',
      tier: 'strong',
      triggeringMetricIds: JSON.stringify(['g1']),
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await ensureTodaysSuggestions('u1', NOW);

    expect(upsertSuggestion).toHaveBeenCalledTimes(1);
    const call = upsertSuggestion.mock.calls[0][0] as {
      where: { userId_date_kind: { kind: string } };
      create: { title: string; tier: string };
    };
    expect(call.where.userId_date_kind.kind).toBe('glucose_fasting_diabetic');
    expect(call.create.tier).toBe('strong');
    expect(result[0].kind).toBe('glucose_fasting_diabetic');
  });

  it('deserializes triggeringMetricIds back to an array on return', async () => {
    findManyPoints.mockResolvedValue([row({ value: 30 })]);
    upsertSuggestion.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      date: TODAY,
      kind: 'recovery_low',
      title: 'x',
      tier: 'moderate',
      triggeringMetricIds: JSON.stringify(['a', 'b']),
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await ensureTodaysSuggestions('u1', NOW);
    expect(result[0].triggeringMetricIds).toEqual(['a', 'b']);
  });
});
