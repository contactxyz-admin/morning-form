import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { addEdge, addNode, addSourceChunks, addSourceDocument } from '@/lib/graph/mutations';
import { LLMClient } from '@/lib/llm/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import type {
  ScribeLLMClient,
  ScribeLLMTurn,
} from '@/lib/scribe/execute';
import { compileTopic, lintTopicOutput } from './compile';
import { TOPIC_KEYS } from './registry';
import {
  TopicCompileLintError,
  type TopicCompiledOutput,
} from './types';

let prisma: PrismaClient;
const llm = new LLMClient({ mock: true });

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

function cleanIronOutput(overrides: Partial<TopicCompiledOutput> = {}, nodeId: string = 'node-ferritin'): TopicCompiledOutput {
  return {
    understanding: {
      heading: 'Your iron picture',
      bodyMarkdown:
        'Ferritin is the main store of iron in the body; your latest ferritin sits below the printed reference band for this panel. Haemoglobin remains within range, so any response is early-stage.',
      citations: [{ nodeId, chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
    },
    whatYouCanDoNow: {
      heading: 'What you can do now',
      bodyMarkdown:
        'Include iron-rich foods (lean red meat, dark leafy greens, pulses) with a source of vitamin C at the same meal. Space tea and coffee at least an hour away from iron-rich meals to help absorption.',
      citations: [{ nodeId, chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
    },
    discussWithClinician: {
      heading: 'Discuss with a clinician',
      bodyMarkdown:
        'A GP could help investigate why iron stores are low — full iron studies including transferrin saturation may be useful, as well as a conversation about menstrual or GI factors.',
      citations: [{ nodeId, chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
    },
    gpPrep: {
      questionsToAsk: [
        'Could we look into why my ferritin is low together?',
        'Would a full iron panel be reasonable as a next step?',
      ],
      relevantHistory: ['Low ferritin on most recent panel.'],
      testsToConsiderRequesting: ['Full iron studies including transferrin saturation.'],
      printableMarkdown: '# Iron — GP prep\nQuestions to ask:\n- Could we look into why my ferritin is low?\n',
    },
    ...overrides,
  };
}

function setIronMock(handler: (prompt: string, system?: string) => TopicCompiledOutput) {
  const generateSpy = vi
    .spyOn(llm, 'generate')
    .mockImplementation(async ({ prompt, system }) => handler(prompt, system));
  return generateSpy;
}

async function seedIronGraph(userId: string) {
  const doc = await addSourceDocument(prisma, userId, {
    kind: 'lab_pdf',
    capturedAt: new Date('2026-01-05T00:00:00Z'),
  });
  const chunkIds = await addSourceChunks(prisma, doc.id, [
    { index: 0, text: 'Ferritin 18 ug/L — below reference band.', offsetStart: 0, offsetEnd: 40 },
    { index: 1, text: 'Haemoglobin 121 g/L — within reference band.', offsetStart: 40, offsetEnd: 85 },
  ]);
  const ferritin = await addNode(prisma, userId, {
    type: 'biomarker',
    canonicalKey: 'ferritin',
    displayName: 'Ferritin',
    attributes: { latestValue: 18, unit: 'ug/L' },
  });
  const haemoglobin = await addNode(prisma, userId, {
    type: 'biomarker',
    canonicalKey: 'haemoglobin',
    displayName: 'Haemoglobin',
    attributes: { latestValue: 121, unit: 'g/L' },
  });
  await addEdge(prisma, userId, {
    type: 'SUPPORTS',
    fromNodeId: ferritin.id,
    toNodeId: ferritin.id,
    fromChunkId: chunkIds[0],
    fromDocumentId: doc.id,
  });
  await addEdge(prisma, userId, {
    type: 'SUPPORTS',
    fromNodeId: haemoglobin.id,
    toNodeId: haemoglobin.id,
    fromChunkId: chunkIds[1],
    fromDocumentId: doc.id,
  });
  return { ferritinId: ferritin.id, haemoglobinId: haemoglobin.id, docId: doc.id };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('compileTopic — stub path', () => {
  it('writes status=stub when no evidence exists', async () => {
    const userId = await makeTestUser(prisma, 'compile-stub');
    const result = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(result.status).toBe('stub');
    expect(result.output).toBeNull();
    const row = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    expect(row?.status).toBe('stub');
    expect(row?.rendered).toBeNull();
  });

  it('never calls the LLM when there is no evidence', async () => {
    const userId = await makeTestUser(prisma, 'compile-stub-no-llm');
    const spy = vi.spyOn(llm, 'generate');
    await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(spy).not.toHaveBeenCalled();
  });

  it('force=true still writes stub when there is no evidence', async () => {
    const userId = await makeTestUser(prisma, 'compile-stub-force');
    const spy = vi.spyOn(llm, 'generate');
    const result = await compileTopic({
      db: prisma,
      llm,
      userId,
      topicKey: TOPIC_KEYS.iron,
      force: true,
    });
    expect(result.status).toBe('stub');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('compileTopic — full compile', () => {
  it('persists rendered output + graphRevisionHash on success', async () => {
    const userId = await makeTestUser(prisma, 'compile-full');
    const { ferritinId } = await seedIronGraph(userId);
    setIronMock(() => cleanIronOutput({}, ferritinId));

    const result = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(result.status).toBe('full');
    expect(result.output?.understanding.bodyMarkdown).toContain('Ferritin');
    const row = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    expect(row?.status).toBe('full');
    expect(row?.rendered).toContain('Ferritin');
    expect(row?.graphRevisionHash).toBe(result.graphRevisionHash);
  });
});

describe('compileTopic — cache behavior', () => {
  it('short-circuits when graphRevisionHash matches and rendered is present', async () => {
    const userId = await makeTestUser(prisma, 'compile-cache-hit');
    const { ferritinId } = await seedIronGraph(userId);
    const firstSpy = setIronMock(() => cleanIronOutput({}, ferritinId));

    const first = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(first.cached).toBe(false);
    expect(firstSpy).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    const secondSpy = vi.spyOn(llm, 'generate');
    const second = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(second.cached).toBe(true);
    expect(second.graphRevisionHash).toBe(first.graphRevisionHash);
    expect(secondSpy).not.toHaveBeenCalled();
  });

  it('falls through to recompile when cached rendered JSON is corrupt', async () => {
    const userId = await makeTestUser(prisma, 'compile-cache-corrupt');
    const { ferritinId } = await seedIronGraph(userId);

    // Seed a TopicPage row with a CURRENT graphRevisionHash but bogus JSON.
    // If we naively trust the hash match, we return null output. The fix:
    // re-parse, and if it fails, fall through and recompile.
    const { getGraphRevision } = await import('@/lib/graph/queries');
    const currentHash = (await getGraphRevision(prisma, userId)).hash;
    await prisma.topicPage.create({
      data: {
        userId,
        topicKey: TOPIC_KEYS.iron,
        status: 'full',
        rendered: '{not valid json',
        graphRevisionHash: currentHash,
      },
    });

    const spy = setIronMock(() => cleanIronOutput({}, ferritinId));
    const result = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(result.cached).toBe(false);
    expect(result.status).toBe('full');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('recompiles when the graph mutates (hash changes)', async () => {
    const userId = await makeTestUser(prisma, 'compile-cache-invalidate');
    const { ferritinId } = await seedIronGraph(userId);
    setIronMock(() => cleanIronOutput({}, ferritinId));

    const first = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(first.cached).toBe(false);

    // Mutate the graph — add a symptom node. Revision hash must change.
    await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
    });

    vi.restoreAllMocks();
    const secondSpy = setIronMock(() => cleanIronOutput({}, ferritinId));
    const second = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(second.cached).toBe(false);
    expect(second.graphRevisionHash).not.toBe(first.graphRevisionHash);
    expect(secondSpy).toHaveBeenCalledTimes(1);
  });

  it('force=true bypasses the cache', async () => {
    const userId = await makeTestUser(prisma, 'compile-force');
    const { ferritinId } = await seedIronGraph(userId);
    setIronMock(() => cleanIronOutput({}, ferritinId));

    await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });

    vi.restoreAllMocks();
    const spy = setIronMock(() => cleanIronOutput({}, ferritinId));
    const forced = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron, force: true });
    expect(forced.cached).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('compileTopic — linter integration', () => {
  it('retries once with a remedial prompt and succeeds on the second pass', async () => {
    const userId = await makeTestUser(prisma, 'compile-retry');
    const { ferritinId } = await seedIronGraph(userId);

    let callNumber = 0;
    const spy = vi.spyOn(llm, 'generate').mockImplementation(async ({ prompt }) => {
      callNumber += 1;
      if (callNumber === 1) {
        // First call includes a clinical directive — will fail the linter.
        return cleanIronOutput(
          {
            whatYouCanDoNow: {
              heading: 'What you can do now',
              bodyMarkdown: 'You should start iron supplementation right away.',
              citations: [{ nodeId: ferritinId, chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
            },
          },
          ferritinId,
        );
      }
      expect(prompt).toMatch(/regulatory linter/i);
      return cleanIronOutput({}, ferritinId);
    });

    const result = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(result.status).toBe('full');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.output?.whatYouCanDoNow.bodyMarkdown).not.toMatch(/start iron supplementation/);
  });

  it('throws TopicCompileLintError when both attempts fail the linter', async () => {
    const userId = await makeTestUser(prisma, 'compile-retry-fail');
    const { ferritinId } = await seedIronGraph(userId);

    vi.spyOn(llm, 'generate').mockImplementation(async () =>
      cleanIronOutput(
        {
          whatYouCanDoNow: {
            heading: 'What you can do now',
            bodyMarkdown: 'Take 14 mg daily as a starting point.',
            citations: [{ nodeId: ferritinId, chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
          },
        },
        ferritinId,
      ),
    );

    let caught: TopicCompileLintError | null = null;
    try {
      await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    } catch (err) {
      caught = err as TopicCompileLintError;
    }
    expect(caught).toBeInstanceOf(TopicCompileLintError);
    expect(caught!.violations.length).toBeGreaterThan(0);
    expect(caught!.violations.some((v) => v.rule === 'dosage_unit')).toBe(true);

    const row = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    expect(row?.compileError).toMatch(/dosage_unit/);
    // First-compile failure row exists for UI visibility but status is 'error', not 'full'.
    expect(row?.status).toBe('error');
    // Linter rejection MUST NOT write `rendered` — there is no previous render here.
    expect(row?.rendered).toBeNull();
  });

  it('rejects citations that reference nodeIds not in the subgraph', async () => {
    const userId = await makeTestUser(prisma, 'compile-citation-hallucination');
    await seedIronGraph(userId);

    // Mock always returns a cleanly worded page but with an invented nodeId.
    // This must fail the citation validator on both passes.
    vi.spyOn(llm, 'generate').mockImplementation(async () =>
      cleanIronOutput({}, 'node-does-not-exist'),
    );

    let caught: TopicCompileLintError | null = null;
    try {
      await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    } catch (err) {
      caught = err as TopicCompileLintError;
    }
    expect(caught).toBeInstanceOf(TopicCompileLintError);
    expect(caught!.violations.some((v) => v.rule === 'citation_nodeid')).toBe(true);
  });

  it('retries and succeeds when the first attempt has a bad citation nodeId', async () => {
    const userId = await makeTestUser(prisma, 'compile-citation-retry');
    const { ferritinId } = await seedIronGraph(userId);

    let callNumber = 0;
    const spy = vi.spyOn(llm, 'generate').mockImplementation(async () => {
      callNumber += 1;
      if (callNumber === 1) {
        return cleanIronOutput({}, 'node-does-not-exist');
      }
      return cleanIronOutput({}, ferritinId);
    });

    const result = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(result.status).toBe('full');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('preserves previous rendered content when a later compile fails the linter', async () => {
    const userId = await makeTestUser(prisma, 'compile-preserve-previous');
    const { ferritinId } = await seedIronGraph(userId);

    setIronMock(() => cleanIronOutput({}, ferritinId));
    const first = await compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron });
    expect(first.status).toBe('full');

    // Mutate to invalidate cache, then mock a bad output that fails on both attempts.
    await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
    });
    vi.restoreAllMocks();
    vi.spyOn(llm, 'generate').mockImplementation(async () =>
      cleanIronOutput(
        {
          whatYouCanDoNow: {
            heading: 'What you can do now',
            bodyMarkdown: 'You should start ferrous sulfate 14 mg daily.',
            citations: [{ nodeId: ferritinId, chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
          },
        },
        ferritinId,
      ),
    );

    await expect(
      compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron }),
    ).rejects.toBeInstanceOf(TopicCompileLintError);

    const row = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    // Previous good render still there — UI falls back to it, not broken content.
    expect(row?.rendered).toContain('dark leafy greens');
    expect(row?.compileError).toMatch(/drug_name|dosage_unit|clinical_directive/);
    // Hash must move forward so a retry (on a fresh graph) doesn't short-circuit
    // the cache back to the stale-but-clean render.
    expect(row?.graphRevisionHash).not.toBe(first.graphRevisionHash);
  });
});

describe('compileTopic — error paths', () => {
  it('records compileError and rethrows when the LLM call throws', async () => {
    const userId = await makeTestUser(prisma, 'compile-llm-throws');
    await seedIronGraph(userId);

    vi.spyOn(llm, 'generate').mockRejectedValue(new Error('LLMTransientError: boom'));

    await expect(
      compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron }),
    ).rejects.toThrow(/boom/);

    const row = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    expect(row?.compileError).toMatch(/boom/);
    expect(row?.rendered).toBeNull();
  });

  it('rejects unknown topic keys synchronously', async () => {
    const userId = await makeTestUser(prisma, 'compile-unknown-topic');
    await expect(
      compileTopic({ db: prisma, llm, userId, topicKey: 'not-a-real-topic' }),
    ).rejects.toThrow(/Unknown topic/);
  });
});

describe('lintTopicOutput — unit', () => {
  it('passes a clean three-tier output', () => {
    const clean = cleanIronOutput();
    const result = lintTopicOutput(clean, TOPIC_KEYS.iron);
    if (!result.passed) {
      throw new Error(`Expected clean, got: ${JSON.stringify(result.violations, null, 2)}`);
    }
    expect(result.passed).toBe(true);
  });

  it('flags when whatYouCanDoNow punts to a clinician', () => {
    const bad = cleanIronOutput({
      whatYouCanDoNow: {
        heading: 'What you can do now',
        bodyMarkdown: 'Ask your GP about follow-up testing.',
        citations: [{ nodeId: 'node-ferritin', chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
      },
    });
    const result = lintTopicOutput(bad, TOPIC_KEYS.iron);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'tier_mismatch')).toBe(true);
  });

  it('flags drug names anywhere in the concatenated output', () => {
    const bad = cleanIronOutput({
      understanding: {
        heading: 'Your iron picture',
        bodyMarkdown: 'Ferritin is low. Ferrous sulfate is one option.',
        citations: [{ nodeId: 'node-ferritin', chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
      },
    });
    const result = lintTopicOutput(bad, TOPIC_KEYS.iron);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'drug_name')).toBe(true);
  });
});

/**
 * U4 compile-time scribe integration — exercises the post-narrative scribe
 * pass. Uses a scripted scribe-LLM fake (same shape as
 * `src/lib/scribe/execute.test.ts`) so we can assert exact behavior without
 * an LLM roundtrip.
 */
function scriptedScribeLLM(turns: ScribeLLMTurn[]): {
  client: ScribeLLMClient;
  calls: Array<{ system: string; userMessages: string[] }>;
} {
  const calls: Array<{ system: string; userMessages: string[] }> = [];
  const queue = [...turns];
  const client: ScribeLLMClient = {
    async turn(req) {
      const userMessages = req.messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content);
      calls.push({ system: req.system, userMessages });
      const next = queue.shift();
      if (!next) throw new Error('scriptedScribeLLM: queue exhausted');
      return next;
    },
  };
  return { client, calls };
}

function endTurn(text: string, modelVersion = 'v-actual'): ScribeLLMTurn {
  return { stopReason: 'end_turn', text, modelVersion, toolCalls: [] };
}

function annotationBlock(annotations: unknown[]): string {
  return `ANNOTATIONS_JSON: ${JSON.stringify(annotations)}`;
}

describe('compileTopic — scribe pass (U4)', () => {
  it('happy path: scribe annotation lands on the understanding section, audit writes with clinical-safe', async () => {
    const userId = await makeTestUser(prisma, 'compile-scribe-happy');
    const { ferritinId } = await seedIronGraph(userId);
    setIronMock(() =>
      cleanIronOutput(
        {
          understanding: {
            heading: 'Your iron picture',
            bodyMarkdown:
              'Ferritin is the main store of iron in the body; your latest ferritin sits below the printed reference band for this panel.',
            citations: [{ nodeId: ferritinId, chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
          },
        },
        ferritinId,
      ),
    );

    const { client } = scriptedScribeLLM([
      endTurn(
        `I reviewed the ferritin value.\n${annotationBlock([
          {
            spanAnchor: 'below the printed reference band',
            judgmentKind: 'reference-range-comparison',
            content: 'Your ferritin is below the lab reference range.',
            citations: [{ nodeId: ferritinId, chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
          },
        ])}`,
      ),
    ]);

    const result = await compileTopic({
      db: prisma,
      llm,
      userId,
      topicKey: TOPIC_KEYS.iron,
      scribeLlm: client,
      scribeRequestIdForTest: 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    expect(result.status).toBe('full');
    const understanding = result.output?.understanding;
    expect(understanding?.scribeAnnotations?.length).toBe(1);
    expect(understanding?.scribeAnnotations?.[0].judgmentKind).toBe('reference-range-comparison');
    expect(understanding?.scribeAnnotations?.[0].citations[0].nodeId).toBe(ferritinId);

    const scribe = await prisma.scribe.findUniqueOrThrow({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    const audit = await prisma.scribeAudit.findUnique({
      where: {
        scribeId_requestId: { scribeId: scribe.id, requestId: 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      },
    });
    expect(audit?.safetyClassification).toBe('clinical-safe');
    expect(audit?.mode).toBe('compile');
  });

  it('out-of-scope: gpPrep.questionsToAsk grows with the routed annotation', async () => {
    const userId = await makeTestUser(prisma, 'compile-scribe-out-of-scope');
    const { ferritinId } = await seedIronGraph(userId);
    setIronMock(() => cleanIronOutput({}, ferritinId));

    const { client } = scriptedScribeLLM([
      endTurn(
        annotationBlock([
          {
            spanAnchor: 'below the printed reference band',
            judgmentKind: 'citation-surfacing',
            content: 'Can we check whether low ferritin is contributing to fatigue?',
            citations: [{ nodeId: ferritinId, chunkId: null, excerpt: 'Ferritin 18 ug/L' }],
            outOfScopeRoute: 'gpPrep',
          },
        ]),
      ),
    ]);

    const result = await compileTopic({
      db: prisma,
      llm,
      userId,
      topicKey: TOPIC_KEYS.iron,
      scribeLlm: client,
    });

    expect(result.status).toBe('full');
    expect(result.output?.gpPrep.questionsToAsk).toContain(
      'Can we check whether low ferritin is contributing to fatigue?',
    );
    // Out-of-scope annotation MUST NOT also land as an inline section annotation.
    expect(result.output?.understanding.scribeAnnotations).toBeUndefined();
  });

  it('cache short-circuit: second compile with unchanged graph hash does not invoke the scribe', async () => {
    const userId = await makeTestUser(prisma, 'compile-scribe-cache');
    const { ferritinId } = await seedIronGraph(userId);
    setIronMock(() => cleanIronOutput({}, ferritinId));

    const firstScribe = scriptedScribeLLM([endTurn(annotationBlock([]))]);
    await compileTopic({
      db: prisma,
      llm,
      userId,
      topicKey: TOPIC_KEYS.iron,
      scribeLlm: firstScribe.client,
    });
    expect(firstScribe.calls).toHaveLength(1);

    vi.restoreAllMocks();
    const secondScribe = scriptedScribeLLM([]);
    const generateSpy = vi.spyOn(llm, 'generate');
    const second = await compileTopic({
      db: prisma,
      llm,
      userId,
      topicKey: TOPIC_KEYS.iron,
      scribeLlm: secondScribe.client,
    });
    expect(second.cached).toBe(true);
    expect(secondScribe.calls).toHaveLength(0);
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('model-version drift: stale audit modelVersion vs Scribe.modelVersion forces a recompile', async () => {
    const userId = await makeTestUser(prisma, 'compile-scribe-drift');
    const { ferritinId } = await seedIronGraph(userId);
    setIronMock(() => cleanIronOutput({}, ferritinId));

    const firstScribe = scriptedScribeLLM([endTurn(annotationBlock([]), 'v-pin-original')]);
    const first = await compileTopic({
      db: prisma,
      llm,
      userId,
      topicKey: TOPIC_KEYS.iron,
      scribeLlm: firstScribe.client,
    });
    expect(first.cached).toBe(false);

    // Operator rolls the scribe forward to a new pinned version. The
    // last-audit modelVersion ('v-pin-original', stored by the scribe's
    // upstream turn) no longer matches — drift => recompile.
    await prisma.scribe.update({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
      data: { modelVersion: 'v-pin-upgraded' },
    });

    vi.restoreAllMocks();
    const secondMock = setIronMock(() => cleanIronOutput({}, ferritinId));
    const secondScribe = scriptedScribeLLM([endTurn(annotationBlock([]), 'v-pin-upgraded')]);
    const second = await compileTopic({
      db: prisma,
      llm,
      userId,
      topicKey: TOPIC_KEYS.iron,
      scribeLlm: secondScribe.client,
    });
    expect(second.cached).toBe(false);
    expect(secondMock).toHaveBeenCalledTimes(1);
    expect(secondScribe.calls).toHaveLength(1);
  });

  it('rejection first attempt writes audit BEFORE remedial retry (D11 ordering)', async () => {
    const userId = await makeTestUser(prisma, 'compile-scribe-reject-first');
    const { ferritinId } = await seedIronGraph(userId);
    setIronMock(() => cleanIronOutput({}, ferritinId));

    // First scribe attempt emits a forbidden phrase -> policy rejects.
    // Second attempt is clean.
    const { client, calls } = scriptedScribeLLM([
      endTurn('You should take ferrous sulfate 14 mg daily.'),
      endTurn(annotationBlock([])),
    ]);

    const result = await compileTopic({
      db: prisma,
      llm,
      userId,
      topicKey: TOPIC_KEYS.iron,
      scribeLlm: client,
      scribeRequestIdForTest: 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(result.status).toBe('full');
    expect(calls).toHaveLength(2);

    // The first-attempt audit landed under the pinned requestId, classification 'rejected'.
    const scribe = await prisma.scribe.findUniqueOrThrow({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    const firstAudit = await prisma.scribeAudit.findUnique({
      where: {
        scribeId_requestId: { scribeId: scribe.id, requestId: 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      },
    });
    expect(firstAudit?.safetyClassification).toBe('rejected');

    // Retry produced a second, DISTINCT audit row.
    const allAudits = await prisma.scribeAudit.findMany({
      where: { scribeId: scribe.id },
    });
    expect(allAudits.length).toBe(2);
    expect(allAudits.some((a) => a.safetyClassification === 'clinical-safe')).toBe(true);

    // Verify the retry actually carried the remedial hint.
    expect(calls[1].userMessages.some((m) => /rejected by the safety policy/i.test(m))).toBe(
      true,
    );
  });

  it('rejection after retry preserves previous rendered content, records compileError, writes second rejected audit', async () => {
    const userId = await makeTestUser(prisma, 'compile-scribe-reject-both');
    const { ferritinId } = await seedIronGraph(userId);

    // First compile: clean narrative + scribe to establish a good render.
    setIronMock(() => cleanIronOutput({}, ferritinId));
    const firstScribe = scriptedScribeLLM([endTurn(annotationBlock([]))]);
    const first = await compileTopic({
      db: prisma,
      llm,
      userId,
      topicKey: TOPIC_KEYS.iron,
      scribeLlm: firstScribe.client,
    });
    expect(first.status).toBe('full');

    // Invalidate cache, then scribe rejects both attempts.
    await addNode(prisma, userId, {
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
    });
    vi.restoreAllMocks();
    setIronMock(() => cleanIronOutput({}, ferritinId));
    const { client } = scriptedScribeLLM([
      endTurn('Take ferrous sulfate 14 mg daily.'),
      endTurn('Ferrous gluconate 300 mg is another option.'),
    ]);

    await expect(
      compileTopic({
        db: prisma,
        llm,
        userId,
        topicKey: TOPIC_KEYS.iron,
        scribeLlm: client,
      }),
    ).rejects.toThrow(/ScribeRejectedError|Scribe remained 'rejected'/);

    const row = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    // Prior render preserved (contains the clean ferritin prose).
    expect(row?.rendered).toContain('dark leafy greens');
    expect(row?.compileError).toMatch(/ScribeRejectedError|rejected/i);

    // Two new rejected audits landed, both keyed by distinct requestIds.
    const scribe = await prisma.scribe.findUniqueOrThrow({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    const rejectedAudits = await prisma.scribeAudit.findMany({
      where: { scribeId: scribe.id, safetyClassification: 'rejected' },
    });
    expect(rejectedAudits.length).toBeGreaterThanOrEqual(2);
  });

  it('regression: existing three-tier schema still validates when scribe is disabled', async () => {
    const userId = await makeTestUser(prisma, 'compile-scribe-regression');
    const { ferritinId } = await seedIronGraph(userId);
    setIronMock(() => cleanIronOutput({}, ferritinId));
    // No scribeLlm — pre-U4 shape.
    const result = await compileTopic({
      db: prisma,
      llm,
      userId,
      topicKey: TOPIC_KEYS.iron,
    });
    expect(result.status).toBe('full');
    expect(result.output?.understanding.scribeAnnotations).toBeUndefined();
    // No scribe row should have been created when scribeLlm is omitted.
    const scribe = await prisma.scribe.findUnique({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    expect(scribe).toBeNull();
  });
});

