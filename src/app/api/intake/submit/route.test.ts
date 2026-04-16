import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';
import { clearMockHandlers, setMockHandlers } from '@/lib/llm/client';

const currentUserMock = vi.fn<() => Promise<{ id: string }>>();

// The route imports `@/lib/db` — route wires the real prisma singleton. We
// hand it the per-test test-db client so the full transaction exercises real
// upserts, unique constraints, and JSON round-trips.
vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

// Force the LLMClient into mock mode by mocking `@/lib/env`. vi.mock is
// hoisted above imports, so this takes effect before llm/client.ts reads env.
vi.mock('@/lib/env', () => ({
  env: {
    MOCK_LLM: 'true',
    NODE_ENV: 'test',
    ANTHROPIC_API_KEY: '',
    DATABASE_URL: 'file:./prisma/.test-graph.db',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

import { POST } from './route';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  clearMockHandlers();
  currentUserMock.mockReset();
});

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('https://app.test/api/intake/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_ESSENTIALS = {
  goals: 'More consistent afternoon energy',
  currentMedications: 'Metformin 500mg',
  currentDiagnoses: '',
  allergies: '',
};

const HAPPY_EXTRACTION = {
  nodes: [
    {
      type: 'symptom',
      canonicalKey: 'low_afternoon_energy',
      displayName: 'Low afternoon energy',
      supportingChunkIndices: [0],
    },
    {
      type: 'symptom',
      canonicalKey: 'fragmented_sleep',
      displayName: 'Fragmented sleep',
      supportingChunkIndices: [0],
    },
  ],
  edges: [],
};

describe('POST /api/intake/submit', () => {
  it('returns 400 on malformed JSON body', async () => {
    currentUserMock.mockResolvedValue({ id: await makeTestUser(prisma, 'submit-bad-json') });
    const req = new Request('https://app.test/api/intake/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when goals is missing (essentials incomplete)', async () => {
    const userId = await makeTestUser(prisma, 'submit-no-goals');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(
      makeRequest({
        historyText: 'I feel tired.',
        essentials: { ...VALID_ESSENTIALS, goals: '' },
        documentNames: [],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Essentials incomplete/);
  });

  it('returns 400 when only goals is filled (no meds/diagnoses/allergies)', async () => {
    const userId = await makeTestUser(prisma, 'submit-only-goals');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(
      makeRequest({
        historyText: '',
        essentials: { goals: 'x', currentMedications: '', currentDiagnoses: '', allergies: '' },
        documentNames: [],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when historyText exceeds the 50KB cap', async () => {
    const userId = await makeTestUser(prisma, 'submit-oversized');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(
      makeRequest({
        historyText: 'x'.repeat(60_000),
        essentials: VALID_ESSENTIALS,
        documentNames: [],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid intake payload/);
  });

  it('happy path — persists nodes, SUPPORTS edges, tentative stubs', async () => {
    const userId = await makeTestUser(prisma, 'submit-happy');
    currentUserMock.mockResolvedValue({ id: userId });
    setMockHandlers([
      { key: 'Intake submission to extract from', handler: () => HAPPY_EXTRACTION },
    ]);

    const res = await POST(
      makeRequest({
        historyText: 'I feel low energy in the afternoons. Sleep is fragmented.',
        essentials: VALID_ESSENTIALS,
        documentNames: [],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodeCount).toBe(2);
    expect(body.tentativeTopicStubs.sort()).toEqual(['energy', 'sleep']);

    // Verify actual persistence.
    const nodes = await prisma.graphNode.findMany({ where: { userId } });
    expect(nodes.map((n) => n.canonicalKey).sort()).toEqual([
      'fragmented_sleep',
      'low_afternoon_energy',
    ]);
    const stubs = await prisma.topicPage.findMany({ where: { userId } });
    expect(stubs.map((s) => s.topicKey).sort()).toEqual(['energy', 'sleep']);
    for (const s of stubs) expect(s.status).toBe('stub');

    const supportsEdges = await prisma.graphEdge.findMany({
      where: { userId, type: 'SUPPORTS' },
    });
    expect(supportsEdges.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves existing TopicPage.status on re-submit (does not regress ready→stub)', async () => {
    const userId = await makeTestUser(prisma, 'submit-preserve-status');
    currentUserMock.mockResolvedValue({ id: userId });

    // Pre-create a 'ready' iron topic page — simulates U8 having compiled it
    // after a previous intake.
    await prisma.topicPage.create({
      data: { userId, topicKey: 'iron', status: 'ready', rendered: 'old' },
    });

    setMockHandlers([
      {
        key: 'Intake submission to extract from',
        handler: () => ({
          nodes: [
            {
              type: 'biomarker',
              canonicalKey: 'ferritin',
              displayName: 'Ferritin',
              supportingChunkIndices: [0],
            },
          ],
          edges: [],
        }),
      },
    ]);

    const res = await POST(
      makeRequest({
        historyText: 'ferritin mentioned',
        essentials: VALID_ESSENTIALS,
        documentNames: [],
      }),
    );
    expect(res.status).toBe(200);
    const ironPage = await prisma.topicPage.findUnique({
      where: { userId_topicKey: { userId, topicKey: 'iron' } },
    });
    expect(ironPage?.status).toBe('ready');
    expect(ironPage?.rendered).toBe('old');
  });

  it('is idempotent on re-submission — same payload reuses the source document', async () => {
    const userId = await makeTestUser(prisma, 'submit-idem');
    currentUserMock.mockResolvedValue({ id: userId });
    setMockHandlers([
      { key: 'Intake submission to extract from', handler: () => HAPPY_EXTRACTION },
    ]);

    const payload = {
      historyText: 'I feel low energy.',
      essentials: VALID_ESSENTIALS,
      documentNames: [],
    };

    const first = await POST(makeRequest(payload));
    const firstBody = await first.json();
    const second = await POST(makeRequest(payload));
    const secondBody = await second.json();

    expect(secondBody.documentId).toBe(firstBody.documentId);
    const docs = await prisma.sourceDocument.findMany({ where: { userId } });
    expect(docs).toHaveLength(1);
  });

  it('returns 502 when the LLM returns unschema-compliant output', async () => {
    const userId = await makeTestUser(prisma, 'submit-llm-invalid');
    currentUserMock.mockResolvedValue({ id: userId });
    setMockHandlers([
      {
        key: 'Intake submission to extract from',
        handler: () => ({
          nodes: [
            {
              type: 'symptom',
              canonicalKey: 'fatigue',
              displayName: 'Fatigue',
              // supportingChunkIndices omitted — schema violation
            },
          ],
          edges: [],
        }),
      },
    ]);

    const res = await POST(
      makeRequest({
        historyText: 'I feel tired.',
        essentials: VALID_ESSENTIALS,
        documentNames: [],
      }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).kind).toBe('LLMValidationError');

    // No partial writes — transaction must have rolled back.
    const nodes = await prisma.graphNode.findMany({ where: { userId } });
    expect(nodes).toHaveLength(0);
    const docs = await prisma.sourceDocument.findMany({ where: { userId } });
    expect(docs).toHaveLength(0);
  });
});
