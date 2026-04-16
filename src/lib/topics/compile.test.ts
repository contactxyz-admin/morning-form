import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { addEdge, addNode, addSourceChunks, addSourceDocument } from '@/lib/graph/mutations';
import { LLMClient } from '@/lib/llm/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
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
    .mockImplementation(async ({ prompt, system }: any) => handler(prompt, system));
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
    const spy = vi.spyOn(llm, 'generate').mockImplementation(async ({ prompt }: any) => {
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

    await expect(
      compileTopic({ db: prisma, llm, userId, topicKey: TOPIC_KEYS.iron }),
    ).rejects.toBeInstanceOf(TopicCompileLintError);

    const row = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: TOPIC_KEYS.iron } },
    });
    expect(row?.compileError).toMatch(/dosage_unit/);
    // Important: linter rejection MUST NOT overwrite a previous rendered page.
    expect(row?.rendered).toBeNull();
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
