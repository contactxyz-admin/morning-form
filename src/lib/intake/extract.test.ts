import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { LLMClient, clearMockHandlers, setMockHandlers } from '../llm/client';
import { LLMValidationError } from '../llm/errors';
import { makeTestUser, setupTestDb, teardownTestDb } from '../graph/test-db';
import { ingestExtraction } from '../graph/mutations';
import {
  chunkIntake,
  computeTentativeTopicStubs,
  extractFromIntake,
  type ExtractFromIntakeInput,
} from './extract';
import { EMPTY_ESSENTIALS } from './types';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  clearMockHandlers();
});

function makeClient() {
  return new LLMClient({ mock: true });
}

describe('chunkIntake', () => {
  it('emits one chunk per non-empty essentials field plus paragraphs', () => {
    const { chunks, combinedText } = chunkIntake(
      'I have been tired for months.\n\nSleep is fragmented.',
      {
        ...EMPTY_ESSENTIALS,
        goals: 'More consistent energy',
        currentMedications: 'Metformin 500mg',
      },
      ['labs-2025.pdf'],
    );
    // goals + meds + 2 history paragraphs + document_names block = 5
    expect(chunks).toHaveLength(5);
    expect(chunks[0].metadata).toEqual({ label: 'GOALS' });
    expect(chunks[chunks.length - 1].metadata).toEqual({ label: 'DOCUMENT_NAMES' });
    // offsets must point into combinedText
    for (const c of chunks) {
      expect(combinedText.slice(c.offsetStart, c.offsetEnd)).toBe(c.text);
    }
  });

  it('skips empty essentials fields and empty history', () => {
    const { chunks } = chunkIntake('', EMPTY_ESSENTIALS, []);
    expect(chunks).toEqual([]);
  });
});

describe('computeTentativeTopicStubs', () => {
  it('matches iron via canonicalKey token', () => {
    const stubs = computeTentativeTopicStubs([
      { type: 'biomarker', canonicalKey: 'ferritin', displayName: 'Ferritin' },
    ]);
    expect(stubs).toEqual(['iron']);
  });
  it('matches iron via multi-token canonicalKey', () => {
    expect(
      computeTentativeTopicStubs([
        { type: 'condition', canonicalKey: 'iron_deficiency', displayName: 'Iron deficiency' },
      ]),
    ).toEqual(['iron']);
  });
  it('matches sleep and energy jointly', () => {
    const stubs = computeTentativeTopicStubs([
      { type: 'symptom', canonicalKey: 'fatigue', displayName: 'Fatigue' },
      { type: 'symptom', canonicalKey: 'fragmented_sleep', displayName: 'Fragmented sleep' },
    ]);
    expect(stubs.sort()).toEqual(['energy', 'sleep']);
  });
  it('matches energy via token prefix (fatigued, exhausted, tiredness)', () => {
    expect(
      computeTentativeTopicStubs([
        { type: 'symptom', canonicalKey: 'exhausted', displayName: 'Exhausted' },
      ]),
    ).toEqual(['energy']);
    expect(
      computeTentativeTopicStubs([
        { type: 'symptom', canonicalKey: 'afternoon_tiredness', displayName: 'Afternoon tiredness' },
      ]),
    ).toEqual(['energy']);
  });
  it('emits nothing when no nodes match any rule', () => {
    expect(
      computeTentativeTopicStubs([
        { type: 'medication', canonicalKey: 'metformin', displayName: 'Metformin' },
      ]),
    ).toEqual([]);
  });
  it('does NOT match iron on substring-only overlap (environmental_allergy, irony_pattern)', () => {
    expect(
      computeTentativeTopicStubs([
        { type: 'symptom', canonicalKey: 'environmental_allergy', displayName: 'Environmental allergy' },
      ]),
    ).toEqual([]);
    expect(
      computeTentativeTopicStubs([
        { type: 'symptom', canonicalKey: 'irony_pattern', displayName: 'Ironic pattern' },
      ]),
    ).toEqual([]);
  });
  it('does NOT match sleep on substring-only overlap (awaken, napper, uninterested)', () => {
    expect(
      computeTentativeTopicStubs([
        { type: 'symptom', canonicalKey: 'awaken', displayName: 'Awaken' },
        { type: 'symptom', canonicalKey: 'napper', displayName: 'Napper' },
        { type: 'mood', canonicalKey: 'uninterested', displayName: 'Uninterested' },
      ]),
    ).toEqual([]);
  });
  it('does NOT match energy on substring-only overlap (retired)', () => {
    expect(
      computeTentativeTopicStubs([
        { type: 'lifestyle', canonicalKey: 'retired', displayName: 'Retired' },
      ]),
    ).toEqual([]);
  });
});

const BASE_INPUT: ExtractFromIntakeInput = {
  historyText:
    'I feel low energy in the afternoons. My sleep is fragmented — I wake up at 3am.',
  essentials: {
    goals: 'More consistent afternoon energy',
    currentMedications: 'Metformin 500mg daily',
    currentDiagnoses: 'type 2 diabetes',
    allergies: 'penicillin',
  },
  documentNames: [],
};

describe('extractFromIntake', () => {
  it('happy path — LLM nodes+edges become a valid IngestExtractionInput', async () => {
    const userId = await makeTestUser(prisma, 'extract-happy');
    setMockHandlers([
      {
        key: 'Intake submission to extract from',
        handler: () => ({
          nodes: [
            {
              type: 'symptom',
              canonicalKey: 'low_afternoon_energy',
              displayName: 'Low afternoon energy',
              supportingChunkIndices: [4],
            },
            {
              type: 'symptom',
              canonicalKey: 'fragmented_sleep',
              displayName: 'Fragmented sleep',
              supportingChunkIndices: [4],
            },
            {
              type: 'medication',
              canonicalKey: 'metformin',
              displayName: 'Metformin',
              attributes: { dose: '500mg', frequency: 'daily' },
              supportingChunkIndices: [1],
            },
            {
              type: 'condition',
              canonicalKey: 'type_2_diabetes',
              displayName: 'Type 2 diabetes',
              supportingChunkIndices: [2],
            },
          ],
          edges: [
            {
              type: 'ASSOCIATED_WITH',
              fromType: 'medication',
              fromCanonicalKey: 'metformin',
              toType: 'condition',
              toCanonicalKey: 'type_2_diabetes',
            },
          ],
        }),
      },
    ]);

    const result = await extractFromIntake({ client: makeClient(), prisma }, userId, BASE_INPUT);
    expect(result.ingestInput.document.kind).toBe('intake_text');
    expect(result.ingestInput.chunks.length).toBeGreaterThan(0);
    expect(result.ingestInput.nodes).toHaveLength(4);
    expect(result.ingestInput.edges).toHaveLength(1);
    expect(result.tentativeTopicStubs.sort()).toEqual(['energy', 'sleep']);

    // Persisting through the real mutations layer must succeed and SUPPORTS
    // edges must land.
    const persisted = await ingestExtraction(prisma, userId, result.ingestInput);
    expect(persisted.nodeIds).toHaveLength(4);
    const supportsEdges = await prisma.graphEdge.findMany({
      where: { userId, type: 'SUPPORTS' },
    });
    expect(supportsEdges.length).toBeGreaterThanOrEqual(4);
  });

  it('rejects LLM output where a node omits supportingChunkIndices', async () => {
    const userId = await makeTestUser(prisma, 'extract-missing-chunks');
    setMockHandlers([
      {
        key: 'Intake submission to extract from',
        handler: () => ({
          nodes: [
            {
              type: 'symptom',
              canonicalKey: 'fatigue',
              displayName: 'Fatigue',
              // supportingChunkIndices missing on purpose
            },
          ],
          edges: [],
        }),
      },
    ]);
    await expect(
      extractFromIntake({ client: makeClient(), prisma }, userId, BASE_INPUT),
    ).rejects.toBeInstanceOf(LLMValidationError);
  });

  it('rejects when the LLM invents a chunk index outside the provided range', async () => {
    const userId = await makeTestUser(prisma, 'extract-oob');
    setMockHandlers([
      {
        key: 'Intake submission to extract from',
        handler: () => ({
          nodes: [
            {
              type: 'symptom',
              canonicalKey: 'fatigue',
              displayName: 'Fatigue',
              supportingChunkIndices: [99],
            },
          ],
          edges: [],
        }),
      },
    ]);
    const promise = extractFromIntake({ client: makeClient(), prisma }, userId, BASE_INPUT);
    await expect(promise).rejects.toThrow(/chunk 99/);
    await expect(promise).rejects.toBeInstanceOf(LLMValidationError);
  });

  it('dedupes duplicate canonicalKeys within a single extraction — merges chunk citations', async () => {
    const userId = await makeTestUser(prisma, 'extract-dup');
    setMockHandlers([
      {
        key: 'Intake submission to extract from',
        handler: () => ({
          nodes: [
            {
              type: 'symptom',
              canonicalKey: 'fatigue',
              displayName: 'Fatigue',
              supportingChunkIndices: [0],
              attributes: { severity: 'moderate' },
            },
            {
              type: 'symptom',
              canonicalKey: 'fatigue',
              displayName: 'Tiredness',
              supportingChunkIndices: [4],
              attributes: { timeOfDay: 'afternoon' },
            },
          ],
          edges: [],
        }),
      },
    ]);
    const result = await extractFromIntake(
      { client: makeClient(), prisma },
      userId,
      BASE_INPUT,
    );
    expect(result.ingestInput.nodes).toHaveLength(1);
    const merged = result.ingestInput.nodes[0];
    expect(merged.canonicalKey).toBe('fatigue');
    expect(merged.supportingChunkIndices).toEqual([0, 4]);
    expect(merged.attributes).toEqual({ severity: 'moderate', timeOfDay: 'afternoon' });
  });

  it('includes existing user nodes as dedup hints in the prompt', async () => {
    const userId = await makeTestUser(prisma, 'extract-hints');
    // Seed an existing node
    await prisma.graphNode.create({
      data: {
        userId,
        type: 'biomarker',
        canonicalKey: 'ferritin',
        displayName: 'Ferritin',
        attributes: JSON.stringify({ latestValue: 18 }),
        confidence: 1.0,
        promoted: true,
      },
    });

    let capturedPrompt = '';
    setMockHandlers([
      {
        key: 'Intake submission to extract from',
        handler: (prompt) => {
          capturedPrompt = prompt;
          return { nodes: [], edges: [] };
        },
      },
    ]);

    await extractFromIntake({ client: makeClient(), prisma }, userId, BASE_INPUT);
    expect(capturedPrompt).toContain('biomarker::ferritin');
  });

  it('is idempotent on re-submission — same payload produces same contentHash', async () => {
    const userId = await makeTestUser(prisma, 'extract-idem');
    setMockHandlers([
      {
        key: 'Intake submission to extract from',
        handler: () => ({
          nodes: [
            {
              type: 'symptom',
              canonicalKey: 'fatigue',
              displayName: 'Fatigue',
              supportingChunkIndices: [0],
            },
          ],
          edges: [],
        }),
      },
    ]);

    const first = await extractFromIntake({ client: makeClient(), prisma }, userId, BASE_INPUT);
    const second = await extractFromIntake({ client: makeClient(), prisma }, userId, BASE_INPUT);
    expect(first.ingestInput.document.contentHash).toBe(second.ingestInput.document.contentHash);

    const firstPersist = await ingestExtraction(prisma, userId, first.ingestInput);
    const secondPersist = await ingestExtraction(prisma, userId, second.ingestInput);
    // Document is deduped; node ids are the same on the second pass.
    expect(secondPersist.documentId).toBe(firstPersist.documentId);
    expect(secondPersist.nodeIds[0]).toBe(firstPersist.nodeIds[0]);
  });
});
