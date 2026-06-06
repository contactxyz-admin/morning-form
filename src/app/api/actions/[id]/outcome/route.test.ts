import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = { NODE_ENV: 'test', DECISIONS_ENABLED: 'true' };

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
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
  envMock.DECISIONS_ENABLED = 'true';
});

async function makeUser(suffix: string): Promise<{ id: string; email: string }> {
  const id = await makeTestUser(prisma, suffix);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id, email: user.email };
}

async function makeCompletedMeasure(
  userId: string,
  opts: { state?: string; verb?: string; acceptedAt?: Date | null; markerName?: string | null } = {},
): Promise<string> {
  const a = await prisma.action.create({
    data: {
      userId,
      scribeRequestId: `req-${userId}-${Math.random().toString(36).slice(2)}`,
      verb: opts.verb ?? 'measure',
      label: 'Re-check ferritin',
      markerName: opts.markerName === undefined ? 'Ferritin' : opts.markerName,
      state: opts.state ?? 'completed',
      acceptedAt: opts.acceptedAt === undefined ? new Date('2026-03-01') : opts.acceptedAt,
    },
  });
  return a.id;
}

/** Seed a biomarker GraphNode point (one dated value per node). */
async function seedBiomarker(userId: string, name: string, value: number, dateIso: string, unit = 'ng/mL') {
  await prisma.graphNode.create({
    data: {
      userId,
      type: 'biomarker',
      canonicalKey: `${name.toLowerCase()}-${dateIso}`,
      displayName: name,
      attributes: JSON.stringify({ value, unit, collectionDate: dateIso }),
    },
  });
}

function postWith(id: string, body: unknown = {}): { req: NextRequest; ctx: { params: { id: string } } } {
  const req = new NextRequest(`http://localhost/api/actions/${id}/outcome`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { req, ctx: { params: { id } } };
}

describe('POST /api/actions/[id]/outcome', () => {
  it('404 when DECISIONS_ENABLED is off', async () => {
    envMock.DECISIONS_ENABLED = '';
    const user = await makeUser('oc-flagoff');
    currentUserMock.mockResolvedValue(user);
    const id = await makeCompletedMeasure(user.id);
    const { req, ctx } = postWith(id);
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('completed measure + ≥2 points → outcome-measured + ActionOutcome with at-acceptance before/after', async () => {
    const user = await makeUser('oc-happy');
    currentUserMock.mockResolvedValue(user);
    // acceptedAt is 2026-03-15. There are pre-acceptance draws (25 @ Mar 1) and
    // a post draw (62 @ Jun 1). "Before" must be the at-acceptance value (25),
    // NOT trajectory-oldest after capping.
    await seedBiomarker(user.id, 'Ferritin', 18, '2026-01-01');
    await seedBiomarker(user.id, 'Ferritin', 25, '2026-03-01');
    await seedBiomarker(user.id, 'Ferritin', 62, '2026-06-01');
    const id = await makeCompletedMeasure(user.id, { acceptedAt: new Date('2026-03-15') });

    const { req, ctx } = postWith(id);
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.afterValue).toBe(62);
    expect(body.beforeValue).toBe(25); // at-acceptance, not oldest (18)

    const row = await prisma.action.findUniqueOrThrow({ where: { id } });
    expect(row.state).toBe('outcome-measured');
    const outcome = await prisma.actionOutcome.findUniqueOrThrow({ where: { actionId: id } });
    expect(outcome.afterValue).toBe(62);
    expect(outcome.beforeValue).toBe(25);
  });

  it('before-value respects acceptedAt with >24 draws (not window-oldest)', async () => {
    const user = await makeUser('oc-window');
    currentUserMock.mockResolvedValue(user);
    // 30 monthly draws — more than the 24-point trajectory cap. acceptedAt sits
    // at draw #3, value 103. The capped trajectory's oldest would be ~draw #7+.
    for (let i = 0; i < 30; i++) {
      const month = String((i % 12) + 1).padStart(2, '0');
      const year = 2024 + Math.floor(i / 12);
      await seedBiomarker(user.id, 'Glucose', 100 + i, `${year}-${month}-01`, 'mg/dL');
    }
    // Draw #2 (i=2) = value 102 @ 2024-03-01; accept just after it.
    const id = await makeCompletedMeasure(user.id, {
      markerName: 'Glucose',
      acceptedAt: new Date('2024-03-05'),
    });

    const { req, ctx } = postWith(id);
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    // At-or-before 2024-03-05 → the 2024-03-01 draw, value 102.
    expect(body.beforeValue).toBe(102);
  });

  it('1-point marker → afterValue only, before null', async () => {
    const user = await makeUser('oc-onepoint');
    currentUserMock.mockResolvedValue(user);
    await seedBiomarker(user.id, 'CRP', 3.2, '2026-06-01', 'mg/L');
    // acceptedAt before the only draw → no at-acceptance value exists.
    const id = await makeCompletedMeasure(user.id, {
      markerName: 'CRP',
      acceptedAt: new Date('2026-01-01'),
    });

    const { req, ctx } = postWith(id);
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.afterValue).toBe(3.2);
    expect(body.beforeValue).toBeNull();
  });

  it('non-completed action → 409, no row', async () => {
    const user = await makeUser('oc-noncompleted');
    currentUserMock.mockResolvedValue(user);
    const id = await makeCompletedMeasure(user.id, { state: 'accepted' });
    const { req, ctx } = postWith(id, { afterValue: 50 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    expect(await prisma.actionOutcome.count({ where: { actionId: id } })).toBe(0);
  });

  it('non-owner → 404', async () => {
    const owner = await makeUser('oc-owner');
    const attacker = await makeUser('oc-attacker');
    const id = await makeCompletedMeasure(owner.id);
    currentUserMock.mockResolvedValue(attacker);
    const { req, ctx } = postWith(id);
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('double-submit → exactly one snapshot', async () => {
    const user = await makeUser('oc-double');
    currentUserMock.mockResolvedValue(user);
    await seedBiomarker(user.id, 'Ferritin', 25, '2026-03-01');
    await seedBiomarker(user.id, 'Ferritin', 62, '2026-06-01');
    const id = await makeCompletedMeasure(user.id, { acceptedAt: new Date('2026-03-15') });

    const a = postWith(id);
    const b = postWith(id);
    const [r1, r2] = await Promise.all([POST(a.req, a.ctx), POST(b.req, b.ctx)]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await prisma.actionOutcome.count({ where: { actionId: id } })).toBe(1);
  });
});
