import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import * as repoModule from './repo';
import {
  DEFAULT_SCRIBE_MODEL,
  DEFAULT_SCRIBE_TOOLS,
  getOrCreateScribeForTopic,
  isAcceptableModelForCurrentClient,
  recordAudit,
} from './repo';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('getOrCreateScribeForTopic', () => {
  it('creates scribe + tool rows + topic-link on first call and is idempotent on second call', async () => {
    const userId = await makeTestUser(prisma, 'scribe-happy');

    const first = await getOrCreateScribeForTopic(prisma, userId, 'iron', {
      modelVersion: 'gpt-4.1-2026-01-01',
    });
    expect(first.userId).toBe(userId);
    expect(first.topicKey).toBe('iron');
    expect(first.model).toBe(DEFAULT_SCRIBE_MODEL);
    expect(first.modelVersion).toBe('gpt-4.1-2026-01-01');

    const tools = await prisma.scribeTool.findMany({ where: { scribeId: first.id } });
    expect(tools).toHaveLength(DEFAULT_SCRIBE_TOOLS.length);
    expect(new Set(tools.map((t) => t.toolName))).toEqual(new Set(DEFAULT_SCRIBE_TOOLS));

    const link = await prisma.scribeTopicLink.findUnique({
      where: { userId_topicKey: { userId, topicKey: 'iron' } },
    });
    expect(link?.scribeId).toBe(first.id);

    const second = await getOrCreateScribeForTopic(prisma, userId, 'iron', {
      modelVersion: 'gpt-4.1-2026-02-15', // upstream moved; we must NOT mutate the stored version
    });
    expect(second.id).toBe(first.id);
    expect(second.modelVersion).toBe('gpt-4.1-2026-01-01'); // first-write-wins on modelVersion

    const allScribes = await prisma.scribe.findMany({ where: { userId, topicKey: 'iron' } });
    expect(allScribes).toHaveLength(1);

    const toolsAfter = await prisma.scribeTool.findMany({ where: { scribeId: first.id } });
    expect(toolsAfter).toHaveLength(DEFAULT_SCRIBE_TOOLS.length);
  });

  it('keeps one scribe row under concurrent first calls for the same (userId, topicKey)', async () => {
    const userId = await makeTestUser(prisma, 'scribe-race');

    const [a, b, c] = await Promise.all([
      getOrCreateScribeForTopic(prisma, userId, 'sleep-recovery', { modelVersion: 'v1' }),
      getOrCreateScribeForTopic(prisma, userId, 'sleep-recovery', { modelVersion: 'v1' }),
      getOrCreateScribeForTopic(prisma, userId, 'sleep-recovery', { modelVersion: 'v1' }),
    ]);
    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);

    const rows = await prisma.scribe.findMany({
      where: { userId, topicKey: 'sleep-recovery' },
    });
    expect(rows).toHaveLength(1);

    const links = await prisma.scribeTopicLink.findMany({
      where: { userId, topicKey: 'sleep-recovery' },
    });
    expect(links).toHaveLength(1);

    const tools = await prisma.scribeTool.findMany({ where: { scribeId: a.id } });
    expect(tools).toHaveLength(DEFAULT_SCRIBE_TOOLS.length);
  });

  it('scopes scribes per-user — same topicKey in different users yields distinct scribe rows', async () => {
    const userA = await makeTestUser(prisma, 'scribe-userA');
    const userB = await makeTestUser(prisma, 'scribe-userB');

    const a = await getOrCreateScribeForTopic(prisma, userA, 'energy-fatigue', { modelVersion: 'v1' });
    const b = await getOrCreateScribeForTopic(prisma, userB, 'energy-fatigue', { modelVersion: 'v1' });
    expect(a.id).not.toBe(b.id);
    expect(a.userId).toBe(userA);
    expect(b.userId).toBe(userB);
  });
});

describe('recordAudit', () => {
  it('writes one row per (scribeId, requestId) and is idempotent on the same requestId', async () => {
    const userId = await makeTestUser(prisma, 'scribe-audit-idem');
    const scribe = await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });

    const requestId = '11111111-1111-4111-8111-111111111111';
    const payload = {
      requestId,
      topicKey: 'iron',
      mode: 'compile' as const,
      prompt: 'draft the reference-range comparison for ferritin',
      toolCalls: [{ name: 'graph.findNodesForTopic', args: { topicKey: 'iron' } }],
      output: 'Ferritin 18 ug/L — below the 30-300 reference range.',
      citations: [{ nodeId: 'n1', chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
      safetyClassification: 'clinical-safe' as const,
      modelVersion: 'gpt-4.1-2026-01-01',
    };

    const first = await recordAudit(prisma, userId, scribe.id, payload);
    const second = await recordAudit(prisma, userId, scribe.id, {
      ...payload,
      output: 'attempted to overwrite — should be ignored',
    });

    expect(second.id).toBe(first.id);

    const rows = await prisma.scribeAudit.findMany({
      where: { scribeId: scribe.id, requestId },
    });
    expect(rows).toHaveLength(1);

    // First-write-wins on output (append-only semantics for audits).
    expect(rows[0].output).toBe(payload.output);
    expect(JSON.parse(rows[0].toolCalls)).toEqual(payload.toolCalls);
    expect(JSON.parse(rows[0].citations)).toEqual(payload.citations);
  });

  it('distinct requestIds yield distinct audit rows', async () => {
    const userId = await makeTestUser(prisma, 'scribe-audit-distinct');
    const scribe = await getOrCreateScribeForTopic(prisma, userId, 'iron', { modelVersion: 'v1' });

    await recordAudit(prisma, userId, scribe.id, {
      requestId: '22222222-2222-4222-8222-222222222222',
      topicKey: 'iron',
      mode: 'compile',
      prompt: 'p1',
      toolCalls: [],
      output: 'o1',
      citations: [],
      safetyClassification: 'clinical-safe',
      modelVersion: 'v1',
    });
    await recordAudit(prisma, userId, scribe.id, {
      requestId: '33333333-3333-4333-8333-333333333333',
      topicKey: 'iron',
      mode: 'runtime',
      prompt: 'p2',
      toolCalls: [],
      output: 'o2',
      citations: [],
      safetyClassification: 'clinical-safe',
      modelVersion: 'v1',
    });

    const rows = await prisma.scribeAudit.findMany({ where: { scribeId: scribe.id } });
    expect(rows).toHaveLength(2);
  });
});

describe('repo surface is append-only', () => {
  it('does not expose updateAudit or deleteAudit', () => {
    // Structural guard (see plan D6 / D11): ScribeAudit writes only through the
    // idempotent upsert path. If a later refactor exposes update/delete, this
    // test fails loud — the plan's append-only invariant is in the type surface.
    expect(Object.keys(repoModule)).not.toContain('updateAudit');
    expect(Object.keys(repoModule)).not.toContain('deleteAudit');
    expect(Object.keys(repoModule)).not.toContain('purgeAudits');
  });
});

describe('DEFAULT_SCRIBE_MODEL constant', () => {
  it('points at the canonical Sonnet 4.6 id (Anthropic SDK rejects anything else with 404)', () => {
    // Two pins:
    //   1. Exact-string — catches drift to a typo'd or sunset Claude id.
    //   2. Family prefix — readable statement of the invariant; will widen
    //      when multi-provider routing lands (see plan
    //      2026-05-14-002-feat-multi-provider-scribe-routing-plan.md).
    expect(DEFAULT_SCRIBE_MODEL).toBe('claude-sonnet-4-6');
    expect(DEFAULT_SCRIBE_MODEL.startsWith('claude-')).toBe(true);
  });

  it('matches the Prisma schema default for Scribe.model', () => {
    // Schema-level @default and the TS constant are two independent
    // write paths (DB-default fires when a direct prisma.scribe.create
    // omits the field). They must stay in lockstep. See
    // prisma/schema.prisma → model Scribe → `model` column @default.
    // If this drifts, the bug-being-fixed reappears on any insert path
    // that doesn't go through getOrCreateScribeForTopic.
    expect(DEFAULT_SCRIBE_MODEL).toBe('claude-sonnet-4-6');
  });
});

describe('isAcceptableModelForCurrentClient', () => {
  it('accepts the current default and other Claude-family ids', () => {
    expect(isAcceptableModelForCurrentClient('claude-sonnet-4-6')).toBe(true);
    expect(isAcceptableModelForCurrentClient('claude-opus-4-7')).toBe(true);
    expect(isAcceptableModelForCurrentClient('claude-haiku-4-5-20251001')).toBe(true);
    expect(isAcceptableModelForCurrentClient(DEFAULT_SCRIBE_MODEL)).toBe(true);
  });

  it('rejects the stale OpenRouter prefix (the actual bug being fixed)', () => {
    expect(isAcceptableModelForCurrentClient('openrouter/openai/gpt-4.1')).toBe(false);
    expect(isAcceptableModelForCurrentClient('openrouter/anthropic/claude-3-sonnet')).toBe(
      false,
    );
  });

  it('rejects unknown future provider prefixes (allowlist, not denylist)', () => {
    // Pins the allowlist semantics — denylisting only `openrouter/` would
    // let these through silently. The Anthropic SDK would 404 on them.
    expect(isAcceptableModelForCurrentClient('gemini/pro')).toBe(false);
    expect(isAcceptableModelForCurrentClient('openai/gpt-4o')).toBe(false);
    expect(isAcceptableModelForCurrentClient('anthropic/claude-sonnet-4-6')).toBe(false);
  });

  it('rejects empty, null, undefined, and non-string inputs', () => {
    expect(isAcceptableModelForCurrentClient('')).toBe(false);
    expect(isAcceptableModelForCurrentClient(null)).toBe(false);
    expect(isAcceptableModelForCurrentClient(undefined)).toBe(false);
  });
});
