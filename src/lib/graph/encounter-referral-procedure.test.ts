import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { addNode } from './mutations';
import { getSubgraphForTopic } from './queries';
import { NodeAttributesValidationError } from './errors';
import { makeTestUser, setupTestDb, teardownTestDb } from './test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('T3 encounter node type', () => {
  it('round-trips a fully-populated encounter write', async () => {
    const userId = await makeTestUser(prisma, 't3-encounter-happy');
    const { id, created } = await addNode(prisma, userId, {
      type: 'encounter',
      canonicalKey: 'encounter_2026_03_14_gp_visit',
      displayName: 'GP visit — Dr Smith',
      attributes: {
        kind: 'gp_visit',
        occurredAt: '2026-03-14T09:30:00Z',
        clinician: 'Dr Smith',
        location: 'The Surgery, High Street',
        reason: 'Blood pressure review',
        outcome: 'Continue current medication, review in 3 months',
        linkedDocumentId: 'doc_abc',
        source: 'nhs_gp_record',
        note: 'No concerns raised',
      },
    });
    expect(created).toBe(true);
    const row = await prisma.graphNode.findUnique({ where: { id } });
    const attrs = JSON.parse(row!.attributes!);
    expect(attrs).toMatchObject({ kind: 'gp_visit', clinician: 'Dr Smith' });
  });

  it('rejects an unknown encounter kind (strict enum)', async () => {
    const userId = await makeTestUser(prisma, 't3-encounter-bad-kind');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'encounter',
        canonicalKey: 'encounter_2026_03_14_bad',
        displayName: 'Bogus encounter',
        attributes: { kind: 'telepathic' as unknown as 'telephone' },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
  });
});

describe('T3 referral node type', () => {
  it('accepts a referral with status=pending and no linkedEncounterId', async () => {
    const userId = await makeTestUser(prisma, 't3-referral-pending');
    const { id, created } = await addNode(prisma, userId, {
      type: 'referral',
      canonicalKey: 'referral_cardiology_2026_03_14',
      displayName: 'Referral to Cardiology',
      attributes: {
        specialty: 'Cardiology',
        reason: 'Palpitations',
        status: 'pending',
        priority: 'routine',
        requestedAt: '2026-03-14',
      },
    });
    expect(created).toBe(true);
    const row = await prisma.graphNode.findUnique({ where: { id } });
    const attrs = JSON.parse(row!.attributes!);
    expect(attrs.status).toBe('pending');
    expect(attrs.linkedEncounterId).toBeUndefined();
  });

  it('accepts completedAt as null (open-ended referral)', async () => {
    const userId = await makeTestUser(prisma, 't3-referral-null-completed');
    const { id } = await addNode(prisma, userId, {
      type: 'referral',
      canonicalKey: 'referral_derm_2026_03_14',
      displayName: 'Referral to Dermatology',
      attributes: { specialty: 'Dermatology', status: 'in_progress', completedAt: null },
    });
    const row = await prisma.graphNode.findUnique({ where: { id } });
    expect(row?.canonicalKey).toBe('referral_derm_2026_03_14');
  });

  it('rejects an unknown referral priority (strict enum)', async () => {
    const userId = await makeTestUser(prisma, 't3-referral-bad-priority');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'referral',
        canonicalKey: 'referral_bogus_2026_03_14',
        displayName: 'Bogus referral',
        attributes: { priority: 'yesterday' as unknown as 'urgent' },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
  });
});

describe('T3 procedure node type', () => {
  it('round-trips a procedure write with known codeSystem', async () => {
    const userId = await makeTestUser(prisma, 't3-procedure-happy');
    const { id, created } = await addNode(prisma, userId, {
      type: 'procedure',
      canonicalKey: 'procedure_ecg_2026_03_14',
      displayName: 'ECG',
      attributes: {
        performedAt: '2026-03-14T10:00:00Z',
        performer: 'Nurse Jones',
        location: 'The Surgery, High Street',
        status: 'completed',
        codeSystem: 'snomed_ct',
        code: '29303009',
        outcome: 'Normal sinus rhythm',
      },
    });
    expect(created).toBe(true);
    const row = await prisma.graphNode.findUnique({ where: { id } });
    const attrs = JSON.parse(row!.attributes!);
    expect(attrs).toMatchObject({ codeSystem: 'snomed_ct', status: 'completed' });
  });

  it('rejects a procedure with an unknown codeSystem (strict enum)', async () => {
    const userId = await makeTestUser(prisma, 't3-procedure-bad-code-system');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'procedure',
        canonicalKey: 'procedure_mystery_2026_03_14',
        displayName: 'Mystery procedure',
        attributes: { codeSystem: 'made_up_code_system' as unknown as 'snomed_ct' },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
  });

  it('rejects a procedure with an unknown status (strict enum)', async () => {
    const userId = await makeTestUser(prisma, 't3-procedure-bad-status');
    await expect(() =>
      addNode(prisma, userId, {
        type: 'procedure',
        canonicalKey: 'procedure_bad_status_2026_03_14',
        displayName: 'Bad status procedure',
        attributes: { status: 'half_done' as unknown as 'completed' },
      }),
    ).rejects.toBeInstanceOf(NodeAttributesValidationError);
  });
});

describe('T3 subgraph retrieval respects new types', () => {
  it('returns encounter + referral when both are in relevantNodeTypes', async () => {
    const userId = await makeTestUser(prisma, 't3-subgraph-enc-ref');
    await addNode(prisma, userId, {
      type: 'encounter',
      canonicalKey: 'encounter_2026_03_14_cardiology',
      displayName: 'Cardiology consultation',
      attributes: { kind: 'specialist_visit' },
    });
    await addNode(prisma, userId, {
      type: 'referral',
      canonicalKey: 'referral_cardiology_2026_03_14',
      displayName: 'Referral to cardiology',
      attributes: { specialty: 'Cardiology', status: 'completed' },
    });
    await addNode(prisma, userId, {
      type: 'medication',
      canonicalKey: 'bisoprolol',
      displayName: 'Bisoprolol',
    });
    const sub = await getSubgraphForTopic(prisma, userId, {
      types: ['encounter', 'referral'],
      canonicalKeyPatterns: ['cardiology'],
      depth: 1,
    });
    const types = new Set(sub.nodes.map((n) => n.type));
    expect(types.has('encounter')).toBe(true);
    expect(types.has('referral')).toBe(true);
    expect(types.has('medication')).toBe(false);
  });
});
