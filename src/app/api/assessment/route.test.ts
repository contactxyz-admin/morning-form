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

import { GET, POST } from './route';

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

    const priorities = await prisma.priorities.findUnique({
      where: { userId },
      include: { items: true },
    });
    expect(priorities).not.toBeNull();
    expect(priorities!.status).toBe('active');
    expect(priorities!.items.length).toBeGreaterThanOrEqual(3);
    expect(priorities!.items.every((item) => item.prioritiesId === priorities!.id)).toBe(true);
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
    const priorities = await prisma.priorities.count({ where: { userId } });
    expect(assessments).toBe(1);
    expect(stateProfiles).toBe(1);
    expect(priorities).toBe(1);
  });

  it('fires PROTOCOL_DELIVERED keyed to the priorities id; re-submits share the funnelId', async () => {
    const userId = await makeTestUser(prisma, 'assess-funnel');
    currentUserMock.mockResolvedValue({ id: userId });

    await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));
    const priorities = await prisma.priorities.findUniqueOrThrow({ where: { userId } });

    const first = await prisma.funnelEvent.findMany({
      where: { event: 'protocol_delivered', userId },
    });
    expect(first).toHaveLength(1);
    expect(first[0].funnelId).toBe(priorities.id);

    // Re-submission fires again but against the SAME stable funnelId, so
    // distinct-funnelId counting (the read model) still counts one protocol.
    currentUserMock.mockResolvedValue({ id: userId });
    await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));
    const all = await prisma.funnelEvent.findMany({
      where: { event: 'protocol_delivered', userId },
    });
    expect(all).toHaveLength(2);
    expect(new Set(all.map((e) => e.funnelId)).size).toBe(1);
  });

  it('rewrites PriorityMarkers on re-submit when responses change the archetype', async () => {
    const userId = await makeTestUser(prisma, 'assess-archetype-flip');
    currentUserMock.mockResolvedValue({ id: userId });

    // First pass — sustained activator.
    await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));
    const firstItems = await prisma.priorityMarker.findMany({
      where: { priorities: { userId } },
      orderBy: { sortOrder: 'asc' },
    });

    // Second pass — pregnancy flag flips to a different archetype + marker set.
    currentUserMock.mockResolvedValue({ id: userId });
    await POST(
      makeRequest({
        responses: { ...SUSTAINED_ACTIVATOR_RESPONSES, pregnancy: 'yes' },
      }),
    );
    const secondItems = await prisma.priorityMarker.findMany({
      where: { priorities: { userId } },
      orderBy: { sortOrder: 'asc' },
    });

    // Stable: single priorities row, item set replaced rather than appended.
    const prioritiesCount = await prisma.priorities.count({ where: { userId } });
    expect(prioritiesCount).toBe(1);
    expect(secondItems.length).toBe(firstItems.length);
  });
});

describe('POST /api/assessment — demographics persistence (A6)', () => {
  async function submitAndReadUser(handle: string, extra: Record<string, unknown>) {
    const userId = await makeTestUser(prisma, handle);
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(makeRequest({ responses: { ...SUSTAINED_ACTIVATOR_RESPONSES, ...extra } }));
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { sexAtBirth: true, birthYear: true },
    });
    return { userId, user };
  }

  it('persists sex_at_birth and birth_year onto the User row', async () => {
    const { user } = await submitAndReadUser('assess-demo-set', {
      sex_at_birth: 'female',
      birth_year: '1985',
    });
    expect(user).toEqual({ sexAtBirth: 'female', birthYear: 1985 });
  });

  it('accepts a numeric birth_year (AssessmentResponses permits a raw number)', async () => {
    const { user } = await submitAndReadUser('assess-demo-numeric', { birth_year: 1990 });
    expect(user.birthYear).toBe(1990);
  });

  it("clears sex with 'prefer_not' and nulls an out-of-range birth_year", async () => {
    const { user } = await submitAndReadUser('assess-demo-clear', {
      sex_at_birth: 'prefer_not',
      birth_year: '2099',
    });
    expect(user).toEqual({ sexAtBirth: null, birthYear: null });
  });

  it('leaves demographics untouched when the keys are absent', async () => {
    const { user } = await submitAndReadUser('assess-demo-absent', {});
    expect(user).toEqual({ sexAtBirth: null, birthYear: null });
  });

  it('does not clobber a stored year when a later submit omits birth_year', async () => {
    const userId = await makeTestUser(prisma, 'assess-demo-preserve');
    currentUserMock.mockResolvedValue({ id: userId });
    await POST(makeRequest({ responses: { ...SUSTAINED_ACTIVATOR_RESPONSES, birth_year: '1970' } }));
    currentUserMock.mockResolvedValue({ id: userId });
    await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { birthYear: true },
    });
    expect(user.birthYear).toBe(1970);
  });
});

describe('GET /api/assessment', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when the user has not completed onboarding', async () => {
    const userId = await makeTestUser(prisma, 'assess-get-unseeded');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns persisted state profile and protocol with items ordered by sortOrder', async () => {
    const userId = await makeTestUser(prisma, 'assess-get-ready');
    currentUserMock.mockResolvedValue({ id: userId });

    // Seed via POST so the shape matches what the production path writes.
    await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));

    currentUserMock.mockResolvedValue({ id: userId });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stateProfile: {
        archetype: string;
        observations: unknown[];
        constraints: unknown[];
        sensitivities: unknown[];
      };
      priorities: {
        status: string;
        confidence: string;
        items: Array<{ sortOrder: number; markerName: string }>;
      };
    };

    expect(body.stateProfile.archetype).toBe('sustained-activator');
    expect(Array.isArray(body.stateProfile.observations)).toBe(true);
    expect(Array.isArray(body.stateProfile.constraints)).toBe(true);
    expect(Array.isArray(body.stateProfile.sensitivities)).toBe(true);

    expect(body.priorities.status).toBe('active');
    expect(body.priorities.items.length).toBeGreaterThanOrEqual(3);
    const sortOrders = body.priorities.items.map((i: { sortOrder: number }) => i.sortOrder);
    expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
  });

  it('scopes by userId: one user cannot read another user‘s assessment', async () => {
    const aliceId = await makeTestUser(prisma, 'assess-get-alice');
    const bobId = await makeTestUser(prisma, 'assess-get-bob');

    currentUserMock.mockResolvedValue({ id: aliceId });
    await POST(makeRequest({ responses: SUSTAINED_ACTIVATOR_RESPONSES }));

    currentUserMock.mockResolvedValue({ id: bobId });
    const res = await GET();
    expect(res.status).toBe(404);
  });
});
