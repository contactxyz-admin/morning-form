import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { addEdge, addNode } from './mutations';
import { getNode } from './queries';
import { NodeAttributesValidationError } from './errors';
import { makeTestUser, setupTestDb, teardownTestDb } from './test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('T7 symptom node — rolling-picture fields', () => {
  it('round-trips a symptom with severityScale / commonTriggers / qualityOfLifeImpact', async () => {
    const userId = await makeTestUser(prisma, 't7-symptom-rolling');
    const { id } = await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
      attributes: {
        firstObservedAt: '2026-02-01',
        severityScale: '0_10',
        defaultSeverity: 6,
        commonTriggers: ['poor_sleep', 'over_exertion'],
        commonRelievers: ['rest', 'hydration'],
        qualityOfLifeImpact: 'moderate',
        bodySystem: 'systemic',
      },
    });
    const hydrated = await getNode(prisma, id);
    expect(hydrated?.attributes).toMatchObject({
      severityScale: '0_10',
      commonTriggers: ['poor_sleep', 'over_exertion'],
      qualityOfLifeImpact: 'moderate',
    });
  });

  it('overwrites rolling-picture fields on re-upsert but preserves firstObservedAt', async () => {
    const userId = await makeTestUser(prisma, 't7-symptom-rolling-reupsert');
    const first = await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
      attributes: {
        firstObservedAt: '2026-02-01',
        currentSeverity: 'mild',
        lastObservedAt: '2026-02-01',
        commonTriggers: ['poor_sleep'],
        qualityOfLifeImpact: 'mild',
        bodySystem: 'systemic',
      },
    });
    const second = await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
      attributes: {
        firstObservedAt: '2026-03-01', // must be ignored (first-write-wins)
        currentSeverity: 'severe', // must overwrite
        lastObservedAt: '2026-04-15', // must overwrite
        commonTriggers: ['poor_sleep', 'stress'], // must overwrite
        qualityOfLifeImpact: 'severe', // must overwrite
      },
    });
    expect(second.id).toBe(first.id);
    const hydrated = await getNode(prisma, first.id);
    expect(hydrated?.attributes).toMatchObject({
      firstObservedAt: '2026-02-01',
      currentSeverity: 'severe',
      lastObservedAt: '2026-04-15',
      commonTriggers: ['poor_sleep', 'stress'],
      qualityOfLifeImpact: 'severe',
      bodySystem: 'systemic',
    });
  });

  it('preserves existing rolling-picture fields when re-extraction emits schema-valid empty values', async () => {
    // Prevents the failure mode where a later extraction that couldn't
    // determine a value emits `[]` for commonTriggers or `''` for a
    // string rolling field — both pass schema validation (optional +
    // passthrough), so without the empty-value guard in mergeAttributes
    // they would silently wipe the concept node's rolling state.
    const userId = await makeTestUser(prisma, 't7-symptom-rolling-empty-guard');
    const first = await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'headache',
      displayName: 'Headache',
      attributes: {
        firstObservedAt: '2026-02-10',
        currentSeverity: 'severe',
        lastObservedAt: '2026-03-10',
        commonTriggers: ['bright_light', 'caffeine_withdrawal'],
        commonRelievers: ['dark_room', 'paracetamol'],
        pattern: 'episodic',
      },
    });
    await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'headache',
      displayName: 'Headache',
      attributes: {
        commonTriggers: [] as string[],
        commonRelievers: [] as string[],
        pattern: '',
        lastObservedAt: '',
      },
    });
    const hydrated = await getNode(prisma, first.id);
    expect(hydrated?.attributes).toMatchObject({
      currentSeverity: 'severe',
      lastObservedAt: '2026-03-10',
      commonTriggers: ['bright_light', 'caffeine_withdrawal'],
      commonRelievers: ['dark_room', 'paracetamol'],
      pattern: 'episodic',
    });
  });
});

describe('T7 mood node — rolling-picture fields', () => {
  it('overwrites currentRating / pattern on re-upsert', async () => {
    const userId = await makeTestUser(prisma, 't7-mood-rolling');
    const first = await addNode(prisma, userId, {
      type: 'mood',
      canonicalKey: 'mood',
      displayName: 'Mood',
      attributes: { currentRating: 4, pattern: 'variable' },
    });
    await addNode(prisma, userId, {
      type: 'mood',
      canonicalKey: 'mood',
      displayName: 'Mood',
      attributes: { currentRating: 7, pattern: 'improving' },
    });
    const hydrated = await getNode(prisma, first.id);
    expect(hydrated?.attributes).toMatchObject({ currentRating: 7, pattern: 'improving' });
  });
});

describe('T7 energy node — rolling-picture fields', () => {
  it('overwrites currentRating / pattern on re-upsert', async () => {
    const userId = await makeTestUser(prisma, 't7-energy-rolling');
    const first = await addNode(prisma, userId, {
      type: 'energy',
      canonicalKey: 'energy',
      displayName: 'Energy',
      attributes: { currentRating: 3, pattern: 'low_morning' },
    });
    await addNode(prisma, userId, {
      type: 'energy',
      canonicalKey: 'energy',
      displayName: 'Energy',
      attributes: { currentRating: 6, pattern: 'steady' },
    });
    const hydrated = await getNode(prisma, first.id);
    expect(hydrated?.attributes).toMatchObject({ currentRating: 6, pattern: 'steady' });
  });
});

describe('T7 symptom_episode node', () => {
  it('round-trips an episode and links INSTANCE_OF → parent symptom', async () => {
    const userId = await makeTestUser(prisma, 't7-episode-ok');
    const { id: symptomId } = await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'headache',
      displayName: 'Headache',
    });
    const { id: episodeId } = await addNode(prisma, userId, {
      type: 'symptom_episode',
      canonicalKey: 'episode_2026_03_14_0930',
      displayName: 'Headache episode — 14 Mar 2026',
      attributes: {
        onsetAt: '2026-03-14T09:30:00Z',
        resolvedAt: '2026-03-14T12:30:00Z',
        severityAtPeak: 7,
        durationMinutes: 180,
        triggers: ['caffeine_withdrawal', 'bright_light'],
        relievers: ['paracetamol', 'dark_room'],
        functionalImpact: 'moderate',
        notes: 'Started mid-morning after skipping coffee.',
      },
    });
    const edgeId = await addEdge(prisma, userId, {
      type: 'INSTANCE_OF',
      fromNodeId: episodeId,
      toNodeId: symptomId,
    });
    expect(edgeId).toBeTruthy();
    const hydrated = await getNode(prisma, episodeId);
    expect(hydrated?.type).toBe('symptom_episode');
    expect(hydrated?.attributes).toMatchObject({
      severityAtPeak: 7,
      durationMinutes: 180,
      triggers: ['caffeine_withdrawal', 'bright_light'],
    });
  });

  it('rejects an episode without onsetAt', async () => {
    const userId = await makeTestUser(prisma, 't7-episode-bad');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'symptom_episode',
        canonicalKey: 'episode_2026_03_14_1000',
        displayName: 'Headache episode',
        attributes: {
          severityAtPeak: 5,
        },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
  });

  it('rejects an episode with severityAtPeak out of 0-10 range', async () => {
    const userId = await makeTestUser(prisma, 't7-episode-bad-sev');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'symptom_episode',
        canonicalKey: 'episode_2026_03_14_1100',
        displayName: 'Headache episode',
        attributes: {
          onsetAt: '2026-03-14T11:00:00Z',
          severityAtPeak: 15,
        },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
  });
});

describe('T7 lifestyle discriminated union', () => {
  it('round-trips diet branch with pattern + avg macros', async () => {
    const userId = await makeTestUser(prisma, 't7-lifestyle-diet');
    const { id } = await addNode(prisma, userId, {
      type: 'lifestyle',
      canonicalKey: 'diet_high_protein',
      displayName: 'High-protein diet',
      attributes: {
        lifestyleSubtype: 'diet',
        pattern: 'high_protein',
        avgProteinGramsPerDay: 140,
        avgCarbsGramsPerDay: 220,
        avgFatGramsPerDay: 70,
        avgCaloriesPerDay: 2200,
        startedOn: '2026-01-01',
      },
    });
    const hydrated = await getNode(prisma, id);
    expect(hydrated?.attributes).toMatchObject({
      lifestyleSubtype: 'diet',
      pattern: 'high_protein',
      avgProteinGramsPerDay: 140,
    });
  });

  it('round-trips caffeine branch with mgPerDay', async () => {
    const userId = await makeTestUser(prisma, 't7-lifestyle-caffeine');
    const { id } = await addNode(prisma, userId, {
      type: 'lifestyle',
      canonicalKey: 'caffeine_daily',
      displayName: 'Daily caffeine intake',
      attributes: {
        lifestyleSubtype: 'caffeine',
        mgPerDay: 300,
        lastIntakeTime: '14:30',
      },
    });
    const hydrated = await getNode(prisma, id);
    expect(hydrated?.attributes).toMatchObject({
      lifestyleSubtype: 'caffeine',
      mgPerDay: 300,
    });
  });

  it('rejects caffeine branch with a field that belongs to the diet branch', async () => {
    const userId = await makeTestUser(prisma, 't7-lifestyle-xbranch');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'lifestyle',
        canonicalKey: 'caffeine_wrong',
        displayName: 'Caffeine with diet fields',
        attributes: {
          lifestyleSubtype: 'caffeine',
          // avgProteinGramsPerDay belongs on the diet branch, not caffeine
          avgProteinGramsPerDay: 100,
        },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
  });

  it('rejects lifestyleSubtype: supplement with a redirection message', async () => {
    const userId = await makeTestUser(prisma, 't7-lifestyle-supp');
    try {
      await addNode(prisma, userId, {
        type: 'lifestyle',
        canonicalKey: 'magnesium_supp',
        displayName: 'Magnesium',
        attributes: {
          lifestyleSubtype: 'supplement',
          quantity: '400 mg nightly',
        },
      });
      throw new Error('expected schema error for supplement subtype');
    } catch (err) {
      expect(err).toBeInstanceOf(NodeAttributesValidationError);
      const issues = (err as NodeAttributesValidationError).issues;
      expect(issues.some((i) => i.path[0] === 'lifestyleSubtype')).toBe(true);
      const serialised = JSON.stringify(issues);
      expect(serialised).toMatch(/medication/i);
      expect(serialised).toMatch(/source.*supplement/i);
    }
  });

  it('routes uppercase SUPPLEMENT through the same redirection (case-insensitive preprocess)', async () => {
    const userId = await makeTestUser(prisma, 't7-lifestyle-supp-upper');
    try {
      await addNode(prisma, userId, {
        type: 'lifestyle',
        canonicalKey: 'magnesium_supp_upper',
        displayName: 'Magnesium',
        attributes: {
          lifestyleSubtype: 'SUPPLEMENT' as unknown as 'supplement',
          quantity: '400 mg nightly',
        },
      });
      throw new Error('expected schema error for SUPPLEMENT subtype');
    } catch (err) {
      expect(err).toBeInstanceOf(NodeAttributesValidationError);
      const serialised = JSON.stringify((err as NodeAttributesValidationError).issues);
      expect(serialised).toMatch(/medication/i);
    }
  });

  it('rejects a typo in lifestyleSubtype without letting UntypedBranch swallow it', async () => {
    const userId = await makeTestUser(prisma, 't7-lifestyle-typo');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'lifestyle',
        canonicalKey: 'caffein_typo',
        displayName: 'Caffein',
        attributes: {
          lifestyleSubtype: 'caffein' as unknown as 'caffeine',
          mgPerDay: 200,
        },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
  });

  it('accepts legacy untyped lifestyle (no lifestyleSubtype)', async () => {
    const userId = await makeTestUser(prisma, 't7-lifestyle-legacy');
    const { id } = await addNode(prisma, userId, {
      type: 'lifestyle',
      canonicalKey: 'legacy_jogging',
      displayName: 'Jogging (pre-T7)',
      attributes: {
        category: 'exercise',
        frequency: '3x/week',
        quantity: '30 minutes',
        note: 'Recorded before T7 subtypes existed.',
      },
    });
    const hydrated = await getNode(prisma, id);
    expect(hydrated?.attributes).toMatchObject({
      category: 'exercise',
      frequency: '3x/week',
    });
    expect((hydrated?.attributes as Record<string, unknown>).lifestyleSubtype).toBeUndefined();
  });
});
