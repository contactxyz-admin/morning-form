import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  SourceRefSchema,
  encodeSourceRef,
  isKnownSourceSystem,
  parseSourceRef,
} from './source-ref';
import { decodeSourceDocumentKind, SOURCE_DOCUMENT_KINDS } from './types';
import { addSourceDocument, ingestExtraction } from './mutations';
import { makeTestUser, setupTestDb, teardownTestDb } from './test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('SourceRefSchema', () => {
  it('accepts a structured ref with a fixed system', () => {
    const ref = {
      system: 'nhs_app',
      recordId: 'nhs-12345',
      pulledAt: '2026-03-15T09:00:00.000Z',
    };
    const result = SourceRefSchema.parse(ref);
    expect(result.system).toBe('nhs_app');
  });

  it('accepts a namespaced system like private_lab:<slug>', () => {
    const ref = {
      system: 'private_lab:medichecks',
      pulledAt: '2026-03-15T09:00:00.000Z',
    };
    expect(() => SourceRefSchema.parse(ref)).not.toThrow();
  });

  it('accepts a terra:<provider> namespaced system', () => {
    const ref = { system: 'terra:oura', pulledAt: '2026-03-15T09:00:00.000Z' };
    expect(() => SourceRefSchema.parse(ref)).not.toThrow();
  });

  it('rejects an unknown fixed system without a known namespace prefix', () => {
    const ref = { system: 'some_random_thing', pulledAt: '2026-03-15T09:00:00.000Z' };
    const r = SourceRefSchema.safeParse(ref);
    expect(r.success).toBe(false);
  });

  it('rejects a namespaced system with invalid slug characters', () => {
    const ref = { system: 'private_lab:WithCaps', pulledAt: '2026-03-15T09:00:00.000Z' };
    expect(SourceRefSchema.safeParse(ref).success).toBe(false);
  });

  it('rejects a non-ISO pulledAt', () => {
    const r = SourceRefSchema.safeParse({ system: 'nhs_app', pulledAt: 'not-a-date' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    const r = SourceRefSchema.safeParse({
      system: 'nhs_app',
      pulledAt: '2026-03-15T09:00:00.000Z',
      extra: 'nope',
    });
    expect(r.success).toBe(false);
  });
});

describe('encodeSourceRef / parseSourceRef', () => {
  it('round-trips a structured ref', () => {
    const ref = {
      system: 'patients_know_best',
      recordId: 'pkb-456',
      pulledAt: '2026-03-15T09:00:00.000Z',
      authorClinician: 'Dr A. Doctor',
    };
    const encoded = encodeSourceRef(ref);
    const parsed = parseSourceRef(encoded);
    expect(parsed).toEqual({ kind: 'structured', value: ref });
  });

  it('preserves legacy free-form strings instead of throwing', () => {
    expect(parseSourceRef('medichecks-2026-04-10.pdf')).toEqual({
      kind: 'legacy',
      value: 'medichecks-2026-04-10.pdf',
    });
  });

  it('treats empty / null as kind: empty', () => {
    expect(parseSourceRef(null)).toEqual({ kind: 'empty' });
    expect(parseSourceRef('')).toEqual({ kind: 'empty' });
    expect(parseSourceRef(undefined)).toEqual({ kind: 'empty' });
  });

  it('falls back to legacy when valid JSON but not a SourceRef shape', () => {
    expect(parseSourceRef(JSON.stringify({ some: 'other' }))).toMatchObject({ kind: 'legacy' });
  });
});

describe('isKnownSourceSystem', () => {
  it('accepts fixed systems and namespaced ones', () => {
    expect(isKnownSourceSystem('nhs_app')).toBe(true);
    expect(isKnownSourceSystem('terra:garmin')).toBe(true);
    expect(isKnownSourceSystem('private_lab:functionhealth')).toBe(true);
    expect(isKnownSourceSystem('bogus')).toBe(false);
  });
});

describe('decodeSourceDocumentKind', () => {
  it('returns the typed enum value for known kinds', () => {
    for (const k of SOURCE_DOCUMENT_KINDS) {
      expect(decodeSourceDocumentKind(k)).toBe(k);
    }
  });

  it('returns "unknown" for strings outside the enum', () => {
    expect(decodeSourceDocumentKind('some_new_kind_from_future')).toBe('unknown');
    expect(decodeSourceDocumentKind(null)).toBe('unknown');
    expect(decodeSourceDocumentKind('')).toBe('unknown');
  });
});

describe('SourceDocumentAlias (T5 cross-institution dedup)', () => {
  it('creates an alias row on initial import', async () => {
    const userId = await makeTestUser(prisma, 't5-alias-first');
    const { id } = await addSourceDocument(prisma, userId, {
      kind: 'gp_letter',
      contentHash: 't5-alias-first-hash',
      capturedAt: new Date('2026-03-10T00:00:00Z'),
      aliases: [
        { system: 'user_upload', recordId: null, pulledAt: new Date('2026-04-01T12:00:00Z') },
      ],
    });
    const aliases = await prisma.sourceDocumentAlias.findMany({
      where: { sourceDocumentId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(aliases).toHaveLength(1);
    expect(aliases[0]?.system).toBe('user_upload');
  });

  it('adds a second alias when the same document is re-imported from a different system', async () => {
    const userId = await makeTestUser(prisma, 't5-alias-second');
    const first = await addSourceDocument(prisma, userId, {
      kind: 'gp_letter',
      contentHash: 't5-alias-second-hash',
      capturedAt: new Date('2026-03-10T00:00:00Z'),
      aliases: [
        { system: 'user_upload', pulledAt: new Date('2026-04-01T12:00:00Z') },
      ],
    });
    const second = await addSourceDocument(prisma, userId, {
      kind: 'gp_letter',
      contentHash: 't5-alias-second-hash',
      capturedAt: new Date('2026-03-10T00:00:00Z'),
      aliases: [
        { system: 'patients_know_best', recordId: 'pkb-789', pulledAt: new Date('2026-04-02T12:00:00Z') },
      ],
    });
    expect(second.id).toBe(first.id);
    expect(second.deduped).toBe(true);
    const aliases = await prisma.sourceDocumentAlias.findMany({
      where: { sourceDocumentId: first.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(aliases).toHaveLength(2);
    const systems = aliases.map((a) => a.system).sort();
    expect(systems).toEqual(['patients_know_best', 'user_upload']);
  });

  it('is idempotent for (system, recordId) pairs already recorded', async () => {
    const userId = await makeTestUser(prisma, 't5-alias-idempotent');
    await addSourceDocument(prisma, userId, {
      kind: 'gp_letter',
      contentHash: 't5-alias-idem-hash',
      capturedAt: new Date(),
      aliases: [{ system: 'nhs_app', recordId: 'rec-1', pulledAt: new Date() }],
    });
    await addSourceDocument(prisma, userId, {
      kind: 'gp_letter',
      contentHash: 't5-alias-idem-hash',
      capturedAt: new Date(),
      aliases: [{ system: 'nhs_app', recordId: 'rec-1', pulledAt: new Date() }],
    });
    const count = await prisma.sourceDocumentAlias.count({
      where: { sourceDocument: { contentHash: 't5-alias-idem-hash' } },
    });
    expect(count).toBe(1);
  });

  it('ingestExtraction persists aliases through the transaction', async () => {
    const userId = await makeTestUser(prisma, 't5-alias-ingest');
    const result = await ingestExtraction(prisma, userId, {
      document: {
        kind: 'gp_letter',
        capturedAt: new Date('2026-03-11T00:00:00Z'),
        contentHash: 't5-ingest-alias-hash',
        aliases: [
          { system: 'nhs_app', recordId: 'nhs-001', pulledAt: new Date('2026-04-03T12:00:00Z') },
        ],
      },
      chunks: [{ index: 0, text: 'Letter from GP', offsetStart: 0, offsetEnd: 14 }],
      nodes: [],
      edges: [],
    });
    const aliases = await prisma.sourceDocumentAlias.findMany({
      where: { sourceDocumentId: result.documentId },
    });
    expect(aliases).toHaveLength(1);
    expect(aliases[0]?.system).toBe('nhs_app');
    expect(aliases[0]?.recordId).toBe('nhs-001');
  });

  it('accepts all T5-added SourceDocument kinds', async () => {
    const userId = await makeTestUser(prisma, 't5-kinds');
    const kinds = [
      'gp_letter',
      'discharge_summary',
      'referral_letter',
      'specialist_letter',
      'imaging_report',
      'pathology_report',
      'at_home_test_result',
      'microbiome_panel',
      'stool_panel',
      'genetics_report',
      'body_composition_scan',
      'dexa_scan',
      'longevity_panel',
      'private_lab_panel',
    ] as const;
    for (const kind of kinds) {
      const { id } = await addSourceDocument(prisma, userId, {
        kind,
        contentHash: `t5-kind-${kind}`,
        capturedAt: new Date(),
      });
      const row = await prisma.sourceDocument.findUnique({ where: { id } });
      expect(row?.kind).toBe(kind);
    }
  });
});
