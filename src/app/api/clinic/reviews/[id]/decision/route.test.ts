import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { createReviewForDocument } from '@/lib/review/queue';

const currentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();

const envMock = {
  NODE_ENV: 'test',
  CLINICIAN_REVIEW_ENABLED: 'true',
  CLINICIAN_ALLOWLIST: 'dr@clinic.org',
  OPS_EMAIL: 'ops@morningform.com',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: '',
  RESEND_FROM: 'onboarding@resend.dev',
};

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrismaSync();
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

const memberEmailMock = vi.fn().mockResolvedValue(undefined);
const opsEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/review/escalation-email', () => ({
  sendMemberEscalationEmail: (...args: unknown[]) => memberEmailMock(...args),
  sendOpsEscalationNotice: (...args: unknown[]) => opsEmailMock(...args),
}));

let prisma: PrismaClient;
function getTestPrismaSync(): PrismaClient {
  return prisma;
}

import { POST } from './route';

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  currentUserMock.mockReset();
  memberEmailMock.mockClear().mockResolvedValue(undefined);
  opsEmailMock.mockClear().mockResolvedValue(undefined);
  envMock.CLINICIAN_REVIEW_ENABLED = 'true';
});

async function makePendingReview(suffix: string) {
  const userId = await makeTestUser(prisma, `dec-${suffix}`);
  const doc = await prisma.sourceDocument.create({
    data: {
      userId,
      kind: 'lab_pdf',
      sourceRef: `panel-${suffix}.pdf`,
      contentHash: `hash-dec-${suffix}-${Math.random().toString(36).slice(2)}`,
      capturedAt: new Date('2026-07-01T00:00:00Z'),
    },
  });
  await createReviewForDocument(prisma, {
    userId,
    sourceDocumentId: doc.id,
    documentCapturedAt: doc.capturedAt,
    biomarkers: [
      {
        canonicalKey: 'ferritin',
        displayName: 'Ferritin',
        value: 12,
        unit: 'µg/L',
        referenceRangeLow: 30,
        referenceRangeHigh: 400,
        flaggedOutOfRange: true,
        collectionDate: '2026-07-01',
      },
    ],
    labProvider: 'TDL',
    sourceRef: doc.sourceRef,
  });
  const review = await prisma.resultReview.findUniqueOrThrow({ where: { sourceDocumentId: doc.id } });
  return { userId, review };
}

function postWith(id: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/clinic/reviews/${id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { req, ctx: { params: { id } } };
}

const CLINICIAN = { id: 'clin-1', email: 'dr@clinic.org' };

describe('POST /api/clinic/reviews/[id]/decision — guards', () => {
  it('404 when CLINICIAN_REVIEW_ENABLED is off', async () => {
    envMock.CLINICIAN_REVIEW_ENABLED = '';
    currentUserMock.mockResolvedValue(CLINICIAN);
    const { req, ctx } = postWith('any', { action: 'approve' });
    expect((await POST(req, ctx)).status).toBe(404);
  });

  it('401 when unauthenticated', async () => {
    currentUserMock.mockResolvedValue(null);
    const { req, ctx } = postWith('any', { action: 'approve' });
    expect((await POST(req, ctx)).status).toBe(401);
  });

  it('403 when signed in but not on the clinician allowlist', async () => {
    currentUserMock.mockResolvedValue({ id: 'u1', email: 'member@example.com' });
    const { req, ctx } = postWith('any', { action: 'approve' });
    expect((await POST(req, ctx)).status).toBe(403);
  });

  it('400 when escalate is missing a reason', async () => {
    currentUserMock.mockResolvedValue(CLINICIAN);
    const { review } = await makePendingReview('noreason');
    const { req, ctx } = postWith(review.id, { action: 'escalate' });
    expect((await POST(req, ctx)).status).toBe(400);
  });

  it('404 on an unknown review id', async () => {
    currentUserMock.mockResolvedValue(CLINICIAN);
    const { req, ctx } = postWith('does-not-exist', { action: 'approve' });
    expect((await POST(req, ctx)).status).toBe(404);
  });
});

describe('POST /api/clinic/reviews/[id]/decision — flow', () => {
  it('approve: 200, review signed off, NO emails sent', async () => {
    currentUserMock.mockResolvedValue(CLINICIAN);
    const { review } = await makePendingReview('approve');
    const { req, ctx } = postWith(review.id, { action: 'approve' });

    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    expect(memberEmailMock).not.toHaveBeenCalled();
    expect(opsEmailMock).not.toHaveBeenCalled();

    const row = await prisma.resultReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(row.status).toBe('approved');
    expect(row.clinicianEmail).toBe('dr@clinic.org');
  });

  it('escalate: 200, member + ops emails fired once each, keys recorded', async () => {
    currentUserMock.mockResolvedValue(CLINICIAN);
    const { review } = await makePendingReview('escalate');
    const { req, ctx } = postWith(review.id, {
      action: 'escalate',
      reason: 'Ferritin well below range — GP follow-up advised.',
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      memberEmailSent: boolean;
      opsEmailSent: boolean;
      escalatedMarkerKeys: string[];
    };
    expect(body.status).toBe('escalated');
    expect(body.memberEmailSent).toBe(true);
    expect(body.opsEmailSent).toBe(true);
    expect(body.escalatedMarkerKeys).toEqual(['ferritin']);
    expect(memberEmailMock).toHaveBeenCalledTimes(1);
    expect(opsEmailMock).toHaveBeenCalledTimes(1);
  });

  it('escalate with unknown markerKeys → 400, review stays pending', async () => {
    currentUserMock.mockResolvedValue(CLINICIAN);
    const { review } = await makePendingReview('badkeys');
    const { req, ctx } = postWith(review.id, {
      action: 'escalate',
      reason: 'Attempting to escalate a marker not in the panel.',
      markerKeys: ['not_in_panel'],
    });

    expect((await POST(req, ctx)).status).toBe(400);
    const row = await prisma.resultReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(row.status).toBe('pending');
  });

  it('already-decided review → 409 with the current status', async () => {
    currentUserMock.mockResolvedValue(CLINICIAN);
    const { review } = await makePendingReview('decided');
    const first = postWith(review.id, { action: 'approve' });
    await POST(first.req, first.ctx);

    const second = postWith(review.id, { action: 'approve' });
    const res = await POST(second.req, second.ctx);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { status: string }).status).toBe('approved');
  });

  it('member email failure does NOT roll back the decision; response reports it', async () => {
    currentUserMock.mockResolvedValue(CLINICIAN);
    memberEmailMock.mockRejectedValue(new Error('resend down'));
    const { review } = await makePendingReview('mailfail');
    const { req, ctx } = postWith(review.id, {
      action: 'escalate',
      reason: 'Escalation whose member email will fail.',
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { memberEmailSent: boolean; opsEmailSent: boolean };
    expect(body.memberEmailSent).toBe(false);
    expect(body.opsEmailSent).toBe(true);

    const row = await prisma.resultReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(row.status).toBe('escalated');
  });
});
