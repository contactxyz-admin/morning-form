import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';
import { DEMO_EMAIL } from '../../../../../prisma/fixtures/demo-ids';

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: '',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

import { GET } from './route';
import { listTopicKeys } from '@/lib/topics/registry';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  // The test DB is shared across all test files; another test file
  // may have created a demo user. Wipe BEFORE each test so we start
  // from a guaranteed-clean slate. (Wiping in afterEach left tests
  // exposed to whatever state preceded them in the worker.)
  await prisma.topicPage.deleteMany({});
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
});

async function makeDemoUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { email: DEMO_EMAIL, llmConsentAcceptedAt: new Date() },
  });
  return user.id;
}

describe('GET /api/health/demo', () => {
  it('returns status: broken with HTTP 503 when the demo user is missing', async () => {
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('broken');
    expect(body.reason).toBe('demo user missing');
  });

  it('returns status: degraded with HTTP 200 when topic pages are short of registry', async () => {
    await makeDemoUser();
    // Demo user exists but no TopicPage rows — every registry key
    // is missing.
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.topicCount).toBe(0);
    expect(body.registryCount).toBe(listTopicKeys().length);
    expect(body.missing).toEqual(listTopicKeys());
    expect(body.fixtureGeneratedAt).toBeTypeOf('string');
  });

  it('returns status: healthy with HTTP 200 when every registry key has a full TopicPage row', async () => {
    const userId = await makeDemoUser();
    for (const topicKey of listTopicKeys()) {
      await prisma.topicPage.create({
        data: {
          userId,
          topicKey,
          status: 'full',
          rendered: '{}',
          graphRevisionHash: null,
        },
      });
    }
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.topicCount).toBe(listTopicKeys().length);
    expect(body.fixtureGeneratedAt).toBeTypeOf('string');
  });

  it('treats non-full status as missing for the degraded check', async () => {
    const userId = await makeDemoUser();
    // status=error rows should not count toward coverage.
    for (const topicKey of listTopicKeys()) {
      await prisma.topicPage.create({
        data: {
          userId,
          topicKey,
          status: 'error',
          rendered: null,
          compileError: 'demo seed test',
        },
      });
    }
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.topicCount).toBe(0);
    expect(body.missing).toEqual(listTopicKeys());
  });
});
