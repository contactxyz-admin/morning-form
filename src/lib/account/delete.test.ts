import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

// ---- Mocks ----
// eraseAccount enumerates blobs via list() and deletes via del(). Mock both so
// tests run without blob credentials. del() defaults to a no-op resolve;
// individual tests override to throw to exercise the retry path.
const delMock = vi.fn<(arg: string | string[]) => Promise<void>>(async () => {});
const listMock = vi.fn<(opts: unknown) => Promise<{ blobs: { pathname: string }[]; cursor?: string; hasMore: boolean }>>(
  async () => ({ blobs: [], hasMore: false }),
);

vi.mock('@vercel/blob', () => ({
  del: (arg: string | string[]) => delMock(arg),
  list: (opts: unknown) => listMock(opts),
}));

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/env', () => ({
  env: { NODE_ENV: 'test' },
  getSessionSecret: () => 'test-session-secret-at-least-32-chars-long-xxxx',
}));

import { eraseAccount, hashDeletionEmail } from './delete';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(() => {
  delMock.mockReset();
  delMock.mockResolvedValue(undefined);
  listMock.mockReset();
  listMock.mockResolvedValue({ blobs: [], hasMore: false });
});

/**
 * Seed a user with EVERY relation populated — direct children, the
 * cascade-swept models, the PriorityMarker/PrioritiesAdjustment grandchildren,
 * SourceDocument with chunks (+ embeddings cascade), an ExportRequest with a
 * blobPath, and the no-FK PII rows (FunnelEvent.userId, LandingPageVisit.email,
 * RawProviderPayload.userId). The residue test depends on this staying complete.
 */
async function seedFullUser(p: PrismaClient): Promise<{ id: string; email: string }> {
  const id = await makeTestUser(p, 'delete-full');
  const user = await p.user.findUniqueOrThrow({ where: { id } });
  const email = user.email;

  await p.userPreferences.create({ data: { userId: id } });
  await p.assessmentResponse.create({ data: { userId: id, responses: '{}' } });
  await p.stateProfile.create({
    data: {
      userId: id,
      archetype: 'a',
      primaryPattern: 'p',
      patternDescription: 'd',
      observations: 'o',
      constraints: 'c',
      sensitivities: 's',
    },
  });
  const priorities = await p.priorities.create({ data: { userId: id, rationale: 'r' } });
  await p.priorityMarker.create({
    data: { prioritiesId: priorities.id, markerName: 'Ferritin', rationale: 'iron', category: 'iron' },
  });
  await p.prioritiesAdjustment.create({
    data: { prioritiesId: priorities.id, description: 'adj', rationale: 'r' },
  });
  await p.checkIn.create({ data: { userId: id, type: 'morning', date: '2026-03-20', responses: '{}' } });
  const chatMsg = await p.chatMessage.create({ data: { userId: id, role: 'user', content: 'hi' } });
  // Action row with chatMessageId provenance — exercises the deletion cascade
  // AND the chatMessage FK relation (onDelete: SetNull).
  const action = await p.action.create({
    data: {
      userId: id,
      chatMessageId: chatMsg.id,
      scribeRequestId: `act-req-${id}`,
      verb: 'measure',
      label: 'Re-check ferritin in 3 months',
      markerName: 'Ferritin',
    },
  });
  // ActionOutcome (Plan 2026-06-06-002 U4) — seeded so the deletion residue
  // scan exercises a real row (the vacuous-guard trap).
  await p.actionOutcome.create({
    data: {
      actionId: action.id,
      userId: id,
      markerName: 'Ferritin',
      beforeValue: 25,
      beforeAt: new Date('2026-03-01'),
      afterValue: 62,
      afterAt: new Date('2026-06-01'),
    },
  });
  // Concierge booking request (Plan 2026-06-06-001) — userId-bearing, swept on
  // erasure via the explicit deleteMany in delete.ts.
  await p.bookingRequest.create({
    data: { userId: id, markerNames: JSON.stringify(['Ferritin']), market: 'uk', status: 'requested' },
  });
  // Retest draws (Plan 2026-06-17-001 U1) — userId-bearing, swept via the
  // explicit deleteMany in delete.ts. Seeded so the residue scan + tombstone
  // count exercise real rows (the vacuous-guard trap).
  await p.draw.create({
    data: { userId: id, sequence: 1, status: 'completed', attribution: 'baseline', completedAt: new Date('2026-03-01') },
  });
  await p.draw.create({
    data: { userId: id, status: 'scheduled', scheduledFor: new Date('2026-06-01') },
  });
  await p.healthConnection.create({ data: { userId: id, provider: 'whoop' } });
  await p.healthDataPoint.create({
    data: { userId: id, provider: 'whoop', category: 'sleep', metric: 'd', value: 7, unit: 'h', timestamp: new Date() },
  });
  await p.suggestion.create({
    data: { userId: id, date: new Date(), kind: 'k', title: 't', tier: 'foundational', triggeringMetricIds: '[]' },
  });

  // Graph + source document with chunk + embedding (cascade chain).
  const doc = await p.sourceDocument.create({
    data: { userId: id, kind: 'lab_pdf', capturedAt: new Date(), storagePath: `uploads/${id}/abc.pdf` },
  });
  const chunk = await p.sourceChunk.create({
    data: { sourceDocumentId: doc.id, index: 0, text: 'ferritin 30', offsetStart: 0, offsetEnd: 11 },
  });
  await p.vectorEmbedding.create({
    data: { sourceChunkId: chunk.id, model: 'voyage-3', dimensions: 3, vector: [0.1, 0.2, 0.3] },
  });
  await p.sourceDocumentAlias.create({
    data: { sourceDocumentId: doc.id, system: 'nhs', pulledAt: new Date() },
  });
  const node1 = await p.graphNode.create({
    data: { userId: id, type: 'marker', canonicalKey: 'ferritin', displayName: 'Ferritin' },
  });
  const node2 = await p.graphNode.create({
    data: { userId: id, type: 'marker', canonicalKey: 'iron', displayName: 'Iron' },
  });
  await p.graphEdge.create({ data: { userId: id, type: 'relates', fromNodeId: node1.id, toNodeId: node2.id } });
  await p.graphNodeLayout.create({ data: { userId: id, nodeId: node1.id, x: 1, y: 2 } });
  await p.topicPage.create({ data: { userId: id, topicKey: 'iron', rendered: '# Iron' } });
  await p.sharedView.create({ data: { userId: id, tokenHash: `sv-${id}`, scope: '{}' } });

  // Cascade-swept auth/session/scribe/mcp models.
  await p.session.create({ data: { userId: id, tokenHash: `sess-${id}`, expiresAt: new Date(Date.now() + 1e6) } });
  await p.magicLinkToken.create({ data: { userId: id, tokenHash: `mlt-${id}`, expiresAt: new Date(Date.now() + 1e6) } });
  const scribe = await p.scribe.create({ data: { userId: id, topicKey: 'iron', modelVersion: 'v1' } });
  await p.scribeTool.create({ data: { scribeId: scribe.id, toolName: 'search' } });
  await p.scribeTopicLink.create({ data: { userId: id, topicKey: 'iron', scribeId: scribe.id } });
  await p.scribeAudit.create({
    data: {
      scribeId: scribe.id,
      userId: id,
      topicKey: 'iron',
      requestId: `req-${id}`,
      mode: 'general',
      prompt: 'p',
      toolCalls: '[]',
      output: 'o',
      citations: '[]',
      safetyClassification: 'ok',
      modelVersion: 'v1',
    },
  });
  const mcp = await p.mCPToken.create({ data: { userId: id, tokenHash: `mcp-${id}`, label: 'l' } });
  await p.mCPAuditEvent.create({
    data: { tokenId: mcp.id, userId: id, toolName: 't', parameters: '{}', resultStatus: 'success', latencyMs: 1 },
  });
  await p.embeddingBackfillState.create({ data: { userId: id, model: 'voyage-3' } });

  // GDPR bookkeeping that should cascade with the user.
  await p.exportRequest.create({
    data: { userId: id, status: 'complete', blobPath: `uploads/${id}/exports/e.zip`, expiresAt: new Date(Date.now() + 1e6) },
  });
  await p.accountDeletionToken.create({
    data: { userId: id, tokenHash: `adt-${id}`, expiresAt: new Date(Date.now() + 1e6) },
  });

  // No-FK PII rows (scrubbed, not deleted).
  await p.funnelEvent.create({ data: { funnelId: `f-${id}`, userId: id, event: 'signup' } });
  await p.landingPageVisit.create({
    data: {
      slug: 's',
      cohortKey: 'c',
      market: 'uk',
      ipHash: 'h',
      mfAnonymousId: `anon-${id}`,
      userAgentClass: 'browser',
      email,
      minuteBucket: BigInt(Date.now()),
    },
  });
  await p.rawProviderPayload.create({
    data: { userId: id, provider: 'whoop', source: 'webhook', sizeBytes: 1, payload: '{}' },
  });

  // MagicLinkRateLimit buckets: two email-keyed (plaintext email subject) that
  // must be deleted on erasure, plus one ip-keyed (salted hash) that must NOT.
  const normalizedEmail = email.trim().toLowerCase();
  await p.magicLinkRateLimit.create({
    data: { subjectKind: 'email-15m', subject: normalizedEmail, window: new Date(0) },
  });
  await p.magicLinkRateLimit.create({
    data: { subjectKind: 'email-24h', subject: normalizedEmail, window: new Date(0) },
  });
  await p.magicLinkRateLimit.create({
    data: { subjectKind: 'ip-1h', subject: `ip-hash-${id}`, window: new Date(0) },
  });

  return { id, email };
}

/**
 * Every physical table+column pair named `userId` or `email`, derived from the
 * Prisma datamodel. Used for the structural information_schema-style residue
 * scan (part (a) of the completeness invariant).
 */
function userIdEmailColumns(): { table: string; column: string }[] {
  const out: { table: string; column: string }[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (field.kind !== 'scalar') continue;
      if (field.name === 'userId' || field.name === 'email') {
        out.push({ table: model.dbName ?? model.name, column: field.name });
      }
    }
  }
  return out;
}

describe('eraseAccount — residue assertion (real test DB)', () => {
  it('leaves zero rows referencing the deleted userId/email anywhere', async () => {
    const { id, email } = await seedFullUser(prisma);

    const result = await eraseAccount(prisma, id, { ipHash: 'ip-hash-xyz' });
    expect(result.outcome).toBe('completed');

    // (a) Structural scan: every userId/email column, zero matches for the
    // deleted id/email. Carve-outs:
    //  - EmbeddingBackfillState.userId legitimately nulls (SetNull) — scanning
    //    for the *value* id naturally finds nothing, so no special case needed.
    //  - AccountDeletionTombstone has no userId/email column (it stores a hash),
    //    so it never appears in this scan.
    for (const { table, column } of userIdEmailColumns()) {
      const value = column === 'email' ? email : id;
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*)::bigint AS n FROM "${table}" WHERE "${column}" = $1`,
        value,
      );
      expect(Number(rows[0].n), `residual ${table}.${column} rows`).toBe(0);
    }

    // (b) FK coverage: every FK targeting User.id is either cascade-annotated or
    // in the explicit delete list. Assert via the structural scan above (any
    // uncovered FK would leave a userId row and fail (a)) plus a direct check
    // that the User row itself is gone.
    const userGone = await prisma.user.findUnique({ where: { id } });
    expect(userGone).toBeNull();

    // (c) Grandchild tables linked only via an intermediate (PriorityMarker /
    // PrioritiesAdjustment via Priorities; SourceChunk / VectorEmbedding /
    // SourceDocumentAlias via SourceDocument) are invisible to (a)/(b) — they
    // have no userId/email column. They are asserted by direct zero-count in the
    // dedicated "grandchildren / embedding cascade are gone" test below, which
    // captures the intermediate ids before erasure.
  });

  it('tombstone survives erasure with consent snapshot + ipHash + counts', async () => {
    const { id, email } = await seedFullUser(prisma);
    const result = await eraseAccount(prisma, id, { ipHash: 'forensic-ip' });
    expect(result.outcome).toBe('completed');

    const tombstone = await prisma.accountDeletionTombstone.findFirstOrThrow({
      where: { emailHash: hashDeletionEmail(email), status: 'completed' },
    });
    expect(tombstone.ipHash).toBe('forensic-ip');
    expect(tombstone.consentHeldAt).toBeTruthy(); // makeTestUser sets llmConsentAcceptedAt
    expect(tombstone.requestedAt).toBeTruthy();
    expect(tombstone.confirmedAt).toBeTruthy();
    expect(tombstone.completedAt).toBeTruthy();

    const counts = JSON.parse(tombstone.deletedCounts ?? '{}');
    expect(counts.priorityMarkers).toBe(1);
    expect(counts.prioritiesAdjustments).toBe(1);
    expect(counts.checkIns).toBe(1);
    // Action rows are an explicit numeric deleteMany count (not 'cascade').
    expect(typeof counts.actions).toBe('number');
    expect(counts.actions).toBeGreaterThanOrEqual(1);
    // Concierge booking requests swept via explicit deleteMany.
    expect(typeof counts.bookingRequests).toBe('number');
    expect(counts.bookingRequests).toBeGreaterThanOrEqual(1);
    // ActionOutcome snapshots swept via explicit deleteMany — the tombstone
    // counts the real seeded row (GDPR #7, the vacuous-guard trap).
    expect(typeof counts.actionOutcomes).toBe('number');
    expect(counts.actionOutcomes).toBeGreaterThanOrEqual(1);
    // Retest draws swept via explicit deleteMany — the tombstone counts the real
    // seeded rows (GDPR #the vacuous-guard trap, Plan 2026-06-17-001).
    expect(typeof counts.draws).toBe('number');
    expect(counts.draws).toBeGreaterThanOrEqual(2);
    expect(counts.sourceDocuments).toBe(1);
    expect(counts.sessions).toBe('cascade');
    expect(counts.funnelEventsScrubbed).toBe(1);
    expect(counts.landingPageVisitsScrubbed).toBe(1);
    expect(counts.rawProviderPayloadsScrubbed).toBe(1);
  });

  it('grandchildren (markers/adjustments) and embedding cascade are gone', async () => {
    const { id } = await seedFullUser(prisma);

    // Capture the ids that link only via an intermediate before erasure.
    const priorities = await prisma.priorities.findFirstOrThrow({ where: { userId: id } });
    const markerCountBefore = await prisma.priorityMarker.count({ where: { prioritiesId: priorities.id } });
    const adjBefore = await prisma.prioritiesAdjustment.count({ where: { prioritiesId: priorities.id } });
    expect(markerCountBefore).toBe(1);
    expect(adjBefore).toBe(1);

    const doc = await prisma.sourceDocument.findFirstOrThrow({ where: { userId: id } });
    const chunk = await prisma.sourceChunk.findFirstOrThrow({ where: { sourceDocumentId: doc.id } });

    await eraseAccount(prisma, id, {});

    expect(await prisma.priorityMarker.count({ where: { prioritiesId: priorities.id } })).toBe(0);
    expect(await prisma.prioritiesAdjustment.count({ where: { prioritiesId: priorities.id } })).toBe(0);
    expect(await prisma.sourceChunk.count({ where: { sourceDocumentId: doc.id } })).toBe(0);
    expect(await prisma.vectorEmbedding.count({ where: { sourceChunkId: chunk.id } })).toBe(0);
    expect(await prisma.sourceDocumentAlias.count({ where: { sourceDocumentId: doc.id } })).toBe(0);
  });

  it('PII rows are scrubbed (fields nulled/blanked) but rows survive', async () => {
    const { id, email } = await seedFullUser(prisma);
    const funnelId = `f-${id}`;
    const anonId = `anon-${id}`;

    await eraseAccount(prisma, id, {});

    const funnel = await prisma.funnelEvent.findFirstOrThrow({ where: { funnelId } });
    expect(funnel.userId).toBeNull();

    const visit = await prisma.landingPageVisit.findFirstOrThrow({ where: { mfAnonymousId: anonId } });
    expect(visit.email).toBeNull();
    expect(visit.slug).toBe('s'); // row survives

    // RawProviderPayload.userId is NULLABLE — scrubbed to null (row survives,
    // PII link gone). Zero rows reference the deleted userId; ours is null.
    expect(await prisma.rawProviderPayload.count({ where: { userId: id } })).toBe(0);
    const raws = await prisma.rawProviderPayload.findMany({ where: { provider: 'whoop' } });
    const ours = raws.find((r) => r.payload === '{}' && r.source === 'webhook');
    expect(ours).toBeDefined();
    expect(ours?.userId).toBeNull();

    // Email no longer present anywhere.
    expect(await prisma.landingPageVisit.count({ where: { email } })).toBe(0);
  });

  it('deletes plaintext-email rate-limit buckets but leaves IP buckets intact', async () => {
    const { id, email } = await seedFullUser(prisma);
    const normalizedEmail = email.trim().toLowerCase();

    await eraseAccount(prisma, id, {});

    // Email-keyed buckets (subject = plaintext email) are gone.
    expect(
      await prisma.magicLinkRateLimit.count({ where: { subject: normalizedEmail } }),
    ).toBe(0);
    // IP-keyed bucket (salted hash subject) survives untouched.
    expect(
      await prisma.magicLinkRateLimit.count({ where: { subject: `ip-hash-${id}` } }),
    ).toBe(1);
  });

  it('post-transaction blob sweep deletes a straggler uploaded mid-erasure', async () => {
    const id = await makeTestUser(prisma, 'delete-straggler');
    // First list() call (pre-transaction enumeration) sees nothing; the second
    // (post-commit sweep) returns a straggler that landed during erasure.
    listMock
      .mockResolvedValueOnce({ blobs: [], hasMore: false })
      .mockResolvedValueOnce({ blobs: [{ pathname: `uploads/${id}/exports/late.zip` }], hasMore: false });

    const result = await eraseAccount(prisma, id, {});
    expect(result.outcome).toBe('completed');

    // del() was called for the straggler in the post-commit sweep.
    const allTargets = delMock.mock.calls.flatMap((c) => {
      const arg = c[0];
      return Array.isArray(arg) ? arg : [arg];
    });
    expect(allTargets).toContain(`uploads/${id}/exports/late.zip`);
  });

  it('blob enumeration unions storagePath, export blobPath, and prefix list()', async () => {
    const { id } = await seedFullUser(prisma);
    // Pre-transaction enumeration sees the orphan; the post-commit sweep (second
    // call, from the afterEach default) sees nothing → only one del() batch.
    listMock.mockResolvedValueOnce({ blobs: [{ pathname: `uploads/${id}/orphan.bin` }], hasMore: false });

    await eraseAccount(prisma, id, {});

    expect(delMock).toHaveBeenCalledTimes(1);
    const targets = delMock.mock.calls[0][0] as string[];
    expect(targets).toContain(`uploads/${id}/abc.pdf`); // SourceDocument.storagePath
    expect(targets).toContain(`uploads/${id}/exports/e.zip`); // ExportRequest.blobPath
    expect(targets).toContain(`uploads/${id}/orphan.bin`); // prefix list()
  });

  it('paginates list() across cursor pages', async () => {
    const { id } = await seedFullUser(prisma);
    listMock
      .mockResolvedValueOnce({ blobs: [{ pathname: `uploads/${id}/p1.bin` }], hasMore: true, cursor: 'c1' })
      .mockResolvedValueOnce({ blobs: [{ pathname: `uploads/${id}/p2.bin` }], hasMore: false });

    await eraseAccount(prisma, id, {});

    // Two pre-transaction enumeration pages (p1 → p2) plus one post-commit
    // sweep page (empty, from the afterEach default).
    expect(listMock).toHaveBeenCalledTimes(3);
    const targets = delMock.mock.calls[0][0] as string[];
    expect(targets).toContain(`uploads/${id}/p1.bin`);
    expect(targets).toContain(`uploads/${id}/p2.bin`);
  });

  it('blob del failure leaves DB untouched + tombstone pending; retry completes', async () => {
    const { id, email } = await seedFullUser(prisma);
    delMock.mockRejectedValueOnce(new Error('blob down'));

    await expect(eraseAccount(prisma, id, {})).rejects.toThrow(/blob down/);

    // DB untouched: user + a child row still present.
    expect(await prisma.user.findUnique({ where: { id } })).not.toBeNull();
    expect(await prisma.checkIn.count({ where: { userId: id } })).toBe(1);

    // Tombstone exists but is still pending.
    const pending = await prisma.accountDeletionTombstone.findFirstOrThrow({
      where: { emailHash: hashDeletionEmail(email) },
    });
    expect(pending.status).toBe('pending');

    // Retry with del succeeding completes erasure and reuses the pending tombstone.
    delMock.mockResolvedValue(undefined);
    const retry = await eraseAccount(prisma, id, {});
    expect(retry.outcome).toBe('completed');
    expect(retry.tombstoneId).toBe(pending.id);
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();

    const completedCount = await prisma.accountDeletionTombstone.count({
      where: { emailHash: hashDeletionEmail(email), status: 'completed' },
    });
    expect(completedCount).toBe(1);
  });

  it('idempotent: a pre-existing completed tombstone short-circuits to noop', async () => {
    // A user whose email already has a completed tombstone (e.g. a raced retry
    // that won earlier) must not be re-erased — eraseAccount returns noop and
    // leaves the user row untouched.
    const id = await makeTestUser(prisma, 'delete-idempotent');
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    const existing = await prisma.accountDeletionTombstone.create({
      data: { emailHash: hashDeletionEmail(user.email), status: 'completed', completedAt: new Date() },
    });

    const result = await eraseAccount(prisma, id, {});
    expect(result.outcome).toBe('noop');
    expect(result.tombstoneId).toBe(existing.id);

    // User row was NOT touched (noop, not erasure).
    expect(await prisma.user.findUnique({ where: { id } })).not.toBeNull();
    expect(delMock).not.toHaveBeenCalled();
  });

  it('user with no blobs erases cleanly (empty blob set is not a failure)', async () => {
    const id = await makeTestUser(prisma, 'delete-noblobs');
    listMock.mockResolvedValue({ blobs: [], hasMore: false });

    const result = await eraseAccount(prisma, id, {});
    expect(result.outcome).toBe('completed');
    expect(delMock).not.toHaveBeenCalled(); // no targets → del() skipped
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
  });
});
