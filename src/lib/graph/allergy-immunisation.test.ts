import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { addNode } from './mutations';
import { getSubgraphForTopic } from './queries';
import { NodeAttributesValidationError } from './errors';
import {
  resolveAllergyReactant,
  resolveVaccine,
  ALLERGY_REACTANT_CANONICAL_KEYS,
  IMMUNISATION_CANONICAL_KEYS,
} from './attributes';
import { makeTestUser, setupTestDb, teardownTestDb } from './test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('T2 allergy node type', () => {
  it('round-trips a registry-backed allergy write', async () => {
    const userId = await makeTestUser(prisma, 't2-allergy-happy');
    const { id, created } = await addNode(prisma, userId, {
      type: 'allergy',
      canonicalKey: 'penicillin',
      displayName: 'Penicillin',
      attributes: { reactantClass: 'drug', reaction: 'hives', severity: 'moderate' },
    });
    expect(created).toBe(true);
    const row = await prisma.graphNode.findUnique({ where: { id } });
    const attrs = JSON.parse(row!.attributes!);
    expect(attrs).toMatchObject({ reactantClass: 'drug', reaction: 'hives', severity: 'moderate' });
  });

  it('rejects an allergy with an invalid severity value', async () => {
    const userId = await makeTestUser(prisma, 't2-allergy-bad-severity');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'allergy',
        canonicalKey: 'amoxicillin',
        displayName: 'Amoxicillin',
        attributes: { reactantClass: 'drug', severity: 'super_mega_severe' as unknown as 'severe' },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
    const rows = await prisma.graphNode.findMany({ where: { userId, type: 'allergy' } });
    expect(rows).toHaveLength(0);
  });

  it('accepts an unknown reactant when reactantClass is supplied explicitly', async () => {
    const userId = await makeTestUser(prisma, 't2-allergy-unknown');
    const { id } = await addNode(prisma, userId, {
      type: 'allergy',
      canonicalKey: 'esoteric_compound_42',
      displayName: 'Esoteric compound 42',
      attributes: { reactantClass: 'other' },
    });
    const row = await prisma.graphNode.findUnique({ where: { id } });
    expect(row?.canonicalKey).toBe('esoteric_compound_42');
  });
});

describe('T2 allergy reactant registry', () => {
  it('resolves direct aliases', () => {
    expect(resolveAllergyReactant('Penicillin')?.canonicalKey).toBe('penicillin');
    expect(resolveAllergyReactant('shellfish')?.reactantClass).toBe('food');
    expect(resolveAllergyReactant('dust mite')?.canonicalKey).toBe('dust_mite');
  });

  it('resolves via substring match for free-form labels', () => {
    expect(resolveAllergyReactant('A documented penicillin allergy')?.canonicalKey).toBe('penicillin');
    expect(resolveAllergyReactant('Bad reaction to bee sting')?.canonicalKey).toBe('bee_venom');
  });

  it('returns undefined for unknown labels', () => {
    expect(resolveAllergyReactant('esoteric_compound_42')).toBeUndefined();
  });

  it('exposes a canonical-key set for membership checks', () => {
    expect(ALLERGY_REACTANT_CANONICAL_KEYS.has('peanut')).toBe(true);
    expect(ALLERGY_REACTANT_CANONICAL_KEYS.has('not_a_reactant')).toBe(false);
  });
});

describe('T2 immunisation node type', () => {
  it('round-trips a valid immunisation write', async () => {
    const userId = await makeTestUser(prisma, 't2-imm-happy');
    const { id, created } = await addNode(prisma, userId, {
      type: 'immunisation',
      canonicalKey: 'covid19_pfizer',
      displayName: 'COVID-19 (Pfizer)',
      attributes: { administeredAt: '2026-03-15', doseNumber: 3, series: 'booster' },
    });
    expect(created).toBe(true);
    const row = await prisma.graphNode.findUnique({ where: { id } });
    const attrs = JSON.parse(row!.attributes!);
    expect(attrs).toMatchObject({ doseNumber: 3, series: 'booster' });
  });

  it('rejects doseNumber ≤ 0', async () => {
    const userId = await makeTestUser(prisma, 't2-imm-bad-dose');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'immunisation',
        canonicalKey: 'influenza',
        displayName: 'Influenza',
        attributes: { doseNumber: 0 },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
  });

  it('rejects an unknown series value (strict enum)', async () => {
    const userId = await makeTestUser(prisma, 't2-imm-bad-series');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'immunisation',
        canonicalKey: 'mmr',
        displayName: 'MMR',
        attributes: { series: 'bogus' as unknown as 'booster' },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
  });
});

describe('T2 immunisation registry', () => {
  it('resolves routine UK vaccines by alias', () => {
    expect(resolveVaccine('flu')?.canonicalKey).toBe('influenza');
    expect(resolveVaccine('comirnaty')?.canonicalKey).toBe('covid19_pfizer');
    expect(resolveVaccine('MMR')?.canonicalKey).toBe('mmr');
  });

  it('returns undefined for unknown vaccine labels', () => {
    expect(resolveVaccine('vaccine_against_boredom')).toBeUndefined();
  });

  it('exposes a canonical-key set', () => {
    expect(IMMUNISATION_CANONICAL_KEYS.has('yellow_fever')).toBe(true);
  });
});

describe('T2 subgraph retrieval respects new types', () => {
  it('getSubgraphForTopic(relevantNodeTypes: ["allergy"]) returns only allergy nodes', async () => {
    const userId = await makeTestUser(prisma, 't2-subgraph-allergy');
    await addNode(prisma, userId, {
      type: 'allergy',
      canonicalKey: 'penicillin',
      displayName: 'Penicillin',
      attributes: { reactantClass: 'drug' },
    });
    await addNode(prisma, userId, {
      type: 'medication',
      canonicalKey: 'amoxicillin',
      displayName: 'Amoxicillin',
    });
    const sub = await getSubgraphForTopic(prisma, userId, {
      types: ['allergy'],
      canonicalKeyPatterns: ['penicillin'],
      depth: 1,
    });
    expect(sub.nodes.every((n) => n.type === 'allergy')).toBe(true);
    expect(sub.nodes.some((n) => n.canonicalKey === 'penicillin')).toBe(true);
    expect(sub.nodes.some((n) => n.canonicalKey === 'amoxicillin')).toBe(false);
  });
});
