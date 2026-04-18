import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string } | null>>();

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

vi.mock('@/lib/env', () => ({
  env: {
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
  currentUserMock.mockReset();
});

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('https://app.test/api/assessment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Responses sized/shaped to land on the 'sustained-activator' branch of the
// protocol engine — covers default protocol items and state profile.
const SUSTAINED_ACTIVATOR_RESPONSES = {
  primary_goal: 'focus',
  afternoon_energy: 4,
  wind_down_ability: 2,
  morning_energy: 3,
  stress_level: 3,
  stimulant_sensitivity: 'moderate',
  sleep_quality: 3,
  anxiety_frequency: 'sometimes',
  night_waking: 'rare',
  pregnancy: 'no',
};

describe('POST /api/assessment', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when responses is missing or wrong type', async () => {
    currentUserMock.mockResolvedValue({ id: await makeTestUser(prisma, 'assess-missing') });
    const res = await POST(makeRequest({ somethingElse: 1 }));
    expect(res.status).toBe(400);
  });

  it('persists AssessmentResponse, StateProfile, Protocol, and ProtocolItems in one transaction', async () => {
    const userId = await makeTestUser(prisma, 'assess-persist');
    currentUserMock.mockResolvedValue({ id: userId });

    const res = await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));
    expect(res.status).toBe(200);

    const assessment = await prisma.assessmentResponse.findUnique({ where: { userId } });
    expect(assessment).not.toBeNull();
    expect(JSON.parse(assessment!.responses)).toMatchObject({ primary_goal: 'focus' });

    const stateProfile = await prisma.stateProfile.findUnique({ where: { userId } });
    expect(stateProfile).not.toBeNull();
    expect(stateProfile!.archetype).toBe('sustained-activator');
    expect(JSON.parse(stateProfile!.observations)).toBeInstanceOf(Array);

    const protocol = await prisma.protocol.findUnique({
      where: { userId },
      include: { items: true },
    });
    expect(protocol).not.toBeNull();
    expect(protocol!.status).toBe('active');
    expect(protocol!.items.length).toBeGreaterThanOrEqual(3);
    expect(protocol!.items.every((item) => item.protocolId === protocol!.id)).toBe(true);
  });

  it('is idempotent: re-submitting the same responses upserts rather than duplicates', async () => {
    const userId = await makeTestUser(prisma, 'assess-idempotent');
    currentUserMock.mockResolvedValue({ id: userId });

    const first = await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));
    expect(first.status).toBe(200);

    currentUserMock.mockResolvedValue({ id: userId });
    const second = await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));
    expect(second.status).toBe(200);

    const assessments = await prisma.assessmentResponse.count({ where: { userId } });
    const stateProfiles = await prisma.stateProfile.count({ where: { userId } });
    const protocols = await prisma.protocol.count({ where: { userId } });
    expect(assessments).toBe(1);
    expect(stateProfiles).toBe(1);
    expect(protocols).toBe(1);
  });

  it('rewrites ProtocolItems on re-submit when responses change the archetype', async () => {
    const userId = await makeTestUser(prisma, 'assess-archetype-flip');
    currentUserMock.mockResolvedValue({ id: userId });

    // First pass — sustained activator.
    await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));
    const firstItems = await prisma.protocolItem.findMany({
      where: { protocol: { userId } },
      orderBy: { sortOrder: 'asc' },
    });

    // Second pass — pregnancy flag flips to behavioural-only protocol.
    currentUserMock.mockResolvedValue({ id: userId });
    await POST(
      makeRequest({
        responses: { ...SUSTAINED_ACTIVATOR_RESPONSES, pregnancy: 'yes' },
      }),
    );
    const secondItems = await prisma.protocolItem.findMany({
      where: { protocol: { userId } },
      orderBy: { sortOrder: 'asc' },
    });

    // Stable: single protocol row, item set replaced rather than appended.
    const protocolCount = await prisma.protocol.count({ where: { userId } });
    expect(protocolCount).toBe(1);
    expect(secondItems.length).toBe(firstItems.length);
    // The behavioural protocol swaps compound names; any difference is fine.
    const firstCompounds = firstItems.map((i) => i.compounds).join('|');
    const secondCompounds = secondItems.map((i) => i.compounds).join('|');
    expect(secondCompounds).not.toBe(firstCompounds);
  });
});
