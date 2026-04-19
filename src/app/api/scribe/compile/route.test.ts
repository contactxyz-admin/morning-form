/**
 * POST /api/scribe/compile — integration tests.
 *
 * The route is a thin wrapper over `compileTopic({ force: true })`, so these
 * tests pin the agent-facing surface (auth, validation, error mapping)
 * rather than re-exercising the compile pipeline — that's covered by
 * `src/lib/topics/compile.test.ts`.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMTransientError,
  LLMValidationError,
} from '@/lib/llm/errors';
import { TopicCompileLintError } from '@/lib/topics/types';
import { ScribeAuditWriteError } from '@/lib/scribe/repo';

const currentUserMock = vi.fn<() => Promise<{ id: string } | null>>();
const compileTopicMock = vi.fn();

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

vi.mock('@/lib/topics/compile', () => ({
  compileTopic: (args: unknown) => compileTopicMock(args),
}));

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'https://app.contact.xyz',
    SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters-long',
    RESEND_API_KEY: '',
    RESEND_FROM: 'onboarding@resend.dev',
    DATABASE_URL: '',
    MOCK_LLM: 'true',
    ANTHROPIC_API_KEY: '',
  },
  getSessionSecret: () => 'test-session-secret-at-least-thirty-two-characters-long',
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
  currentUserMock.mockReset();
  compileTopicMock.mockReset();
});

function makeRequest(body: unknown, options: { rawBody?: string } = {}): Request {
  return new Request('https://app.test/api/scribe/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

async function callPost(req: Request): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(req as any);
}

describe('POST /api/scribe/compile', () => {
  it('returns 401 when no user is signed in', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await callPost(makeRequest({ topicKey: 'iron' }));
    expect(res.status).toBe(401);
    expect(compileTopicMock).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON', async () => {
    const userId = await makeTestUser(prisma, 'compile-400-json');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await callPost(makeRequest({}, { rawBody: '{not json' }));
    expect(res.status).toBe(400);
  });

  // Regression guard for the `safeJson` falsy-check trap. A body of literal
  // JSON `null` parses successfully but is falsy — a naive `if (!json)` guard
  // would misdiagnose it as a parse failure. The correct outcome is to reach
  // zod and fail on shape (body must be an object with `topicKey`), i.e. 400
  // "Invalid body." with `issues`, not 400 "Invalid JSON body."
  it('returns 400 "Invalid body." (not "Invalid JSON body.") when body is literal JSON null', async () => {
    const userId = await makeTestUser(prisma, 'compile-400-null-body');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await callPost(makeRequest({}, { rawBody: 'null' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid body.');
    expect(body.issues).toBeDefined();
  });

  it('returns 400 when topicKey is missing', async () => {
    const userId = await makeTestUser(prisma, 'compile-400-topic');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await callPost(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown topicKey — unknown values never reach the compile pipeline', async () => {
    const userId = await makeTestUser(prisma, 'compile-404');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await callPost(makeRequest({ topicKey: 'not-a-real-topic' }));
    expect(res.status).toBe(404);
    expect(compileTopicMock).not.toHaveBeenCalled();
  });

  it('happy path — calls compileTopic with force=true and returns the result', async () => {
    const userId = await makeTestUser(prisma, 'compile-happy');
    currentUserMock.mockResolvedValue({ id: userId });
    const result = {
      topicKey: 'iron',
      status: 'stub',
      graphRevisionHash: 'abc123',
      cached: false,
      output: null,
    };
    compileTopicMock.mockResolvedValue(result);

    const res = await callPost(makeRequest({ topicKey: 'iron' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      topicKey: 'iron',
      status: 'stub',
      cached: false,
      // Pin to the exact registry value so a regression that silently drops
      // the displayName field (or returns the topicKey by mistake) would
      // fail here, rather than matching `expect.any(String)`.
      displayName: 'Iron status',
    });

    // Force=true is the whole point of the agent-facing compile route —
    // regressing this to `force: false` would turn it into a cache read
    // that pretends to be a recompile.
    expect(compileTopicMock).toHaveBeenCalledTimes(1);
    expect(compileTopicMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        topicKey: 'iron',
        force: true,
      }),
    );
  });

  it('maps TopicCompileLintError to 422 with violations', async () => {
    const userId = await makeTestUser(prisma, 'compile-422');
    currentUserMock.mockResolvedValue({ id: userId });
    compileTopicMock.mockRejectedValue(
      new TopicCompileLintError([
        {
          rule: 'missing_citation',
          message: 'test',
        },
      ]),
    );

    const res = await callPost(makeRequest({ topicKey: 'iron' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    // Assert exact shape. `toBeDefined()` would pass for `violations: null`
    // or `violations: []` — both of which would be regressions that silently
    // ship an empty violations array to agents.
    expect(body.violations).toEqual([
      { rule: 'missing_citation', message: 'test' },
    ]);
  });

  it.each([
    ['LLMAuthError', new LLMAuthError('no key'), 502],
    ['LLMRateLimitError', new LLMRateLimitError(5), 503],
    ['LLMTransientError', new LLMTransientError(500, 'bust'), 503],
    ['LLMValidationError', new LLMValidationError('validation', 'bad shape'), 502],
  ])('maps %s to HTTP %s', async (_label, err, status) => {
    const userId = await makeTestUser(prisma, `compile-err-${status}-${_label}`);
    currentUserMock.mockResolvedValue({ id: userId });
    compileTopicMock.mockRejectedValue(err);

    const res = await callPost(makeRequest({ topicKey: 'iron' }));
    expect(res.status).toBe(status);
  });

  it('maps ScribeAuditWriteError to 500 with a distinct error body', async () => {
    const userId = await makeTestUser(prisma, 'compile-audit-write-error');
    currentUserMock.mockResolvedValue({ id: userId });
    compileTopicMock.mockRejectedValue(
      new ScribeAuditWriteError('db connection refused', new Error('boom')),
    );

    const res = await callPost(makeRequest({ topicKey: 'iron' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    // D11 audit-before-gate regressions must be distinguishable from generic
    // compile failures — a silent fallthrough to "Failed to compile topic."
    // would hide a regulatory-trail gap inside ordinary error noise.
    expect(body.error).toBe('Audit write failed.');
    expect(body.details).toBe('db connection refused');
  });

  it('maps an unknown error to 500', async () => {
    const userId = await makeTestUser(prisma, 'compile-500');
    currentUserMock.mockResolvedValue({ id: userId });
    compileTopicMock.mockRejectedValue(new Error('unexpected'));

    const res = await callPost(makeRequest({ topicKey: 'iron' }));
    expect(res.status).toBe(500);
  });
});
