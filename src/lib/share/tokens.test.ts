import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  createShare,
  generateRawShareToken,
  hashShareToken,
  listSharesForUser,
  markShareViewed,
  resolveShare,
  revokeShare,
} from './tokens';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('hashShareToken', () => {
  it('is deterministic for the same input', () => {
    const a = hashShareToken('abc');
    const b = hashShareToken('abc');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('differs between tokens', () => {
    expect(hashShareToken('a')).not.toBe(hashShareToken('b'));
  });

  it('session-secret-dependent (different prefix than session hash)', () => {
    // The HMAC prefix "share:" means a session-cookie raw token won't verify
    // as a share token and vice versa even if values collide.
    const raw = generateRawShareToken();
    expect(hashShareToken(raw)).not.toBe(hashShareToken(`share:${raw}`));
  });
});

describe('createShare / resolveShare', () => {
  it('round-trips a topic share', async () => {
    const userId = await makeTestUser(prisma, 'share-topic');
    const { rawToken } = await createShare(prisma, {
      userId,
      scope: { kind: 'topic', topicKey: 'iron' },
      label: 'Iron for Dr. Smith',
    });
    const resolved = await resolveShare(prisma, rawToken);
    expect(resolved).not.toBeNull();
    expect(resolved?.userId).toBe(userId);
    expect(resolved?.scope).toEqual({ kind: 'topic', topicKey: 'iron' });
    expect(resolved?.label).toBe('Iron for Dr. Smith');
    expect(resolved?.revokedAt).toBeNull();
  });

  it('persists redactions and round-trips them', async () => {
    const userId = await makeTestUser(prisma, 'share-redactions');
    const { rawToken } = await createShare(prisma, {
      userId,
      scope: { kind: 'topic', topicKey: 'iron' },
      redactions: { hideNodeIds: ['node-1', 'node-2'] },
    });
    const resolved = await resolveShare(prisma, rawToken);
    expect(resolved?.redactions.hideNodeIds).toEqual(['node-1', 'node-2']);
  });

  it('rejects unknown tokens', async () => {
    const resolved = await resolveShare(prisma, generateRawShareToken());
    expect(resolved).toBeNull();
  });

  it('rejects empty tokens', async () => {
    expect(await resolveShare(prisma, '')).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const userId = await makeTestUser(prisma, 'share-expired');
    const { rawToken } = await createShare(prisma, {
      userId,
      scope: { kind: 'topic', topicKey: 'iron' },
      expiresAt: new Date('2020-01-01'),
    });
    const resolved = await resolveShare(prisma, rawToken);
    expect(resolved).toBeNull();
  });
});

describe('revokeShare', () => {
  it('revokes a share and subsequent resolve returns null', async () => {
    const userId = await makeTestUser(prisma, 'share-revoke');
    const { id, rawToken } = await createShare(prisma, {
      userId,
      scope: { kind: 'topic', topicKey: 'iron' },
    });
    expect(await resolveShare(prisma, rawToken)).not.toBeNull();
    const ok = await revokeShare(prisma, userId, id);
    expect(ok).toBe(true);
    expect(await resolveShare(prisma, rawToken)).toBeNull();
  });

  it('refuses to revoke a share owned by another user', async () => {
    const ownerId = await makeTestUser(prisma, 'share-owner');
    const attackerId = await makeTestUser(prisma, 'share-attacker');
    const { id, rawToken } = await createShare(prisma, {
      userId: ownerId,
      scope: { kind: 'topic', topicKey: 'iron' },
    });
    const ok = await revokeShare(prisma, attackerId, id);
    expect(ok).toBe(false);
    expect(await resolveShare(prisma, rawToken)).not.toBeNull();
  });
});

describe('markShareViewed', () => {
  it('increments viewCount and sets lastViewedAt', async () => {
    const userId = await makeTestUser(prisma, 'share-viewed');
    const { id } = await createShare(prisma, {
      userId,
      scope: { kind: 'topic', topicKey: 'iron' },
    });
    await markShareViewed(prisma, id);
    await markShareViewed(prisma, id);
    const row = await prisma.sharedView.findUnique({ where: { id } });
    expect(row?.viewCount).toBe(2);
    expect(row?.lastViewedAt).not.toBeNull();
  });
});

describe('listSharesForUser', () => {
  it('returns only the requesting user shares, newest first', async () => {
    const userA = await makeTestUser(prisma, 'share-list-a');
    const userB = await makeTestUser(prisma, 'share-list-b');
    await createShare(prisma, { userId: userA, scope: { kind: 'topic', topicKey: 'iron' } });
    await new Promise((r) => setTimeout(r, 5));
    await createShare(prisma, { userId: userA, scope: { kind: 'topic', topicKey: 'sleep-recovery' } });
    await createShare(prisma, { userId: userB, scope: { kind: 'topic', topicKey: 'iron' } });
    const shares = await listSharesForUser(prisma, userA);
    expect(shares).toHaveLength(2);
    expect(shares[0].scope).toEqual({ kind: 'topic', topicKey: 'sleep-recovery' });
    expect(shares[1].scope).toEqual({ kind: 'topic', topicKey: 'iron' });
  });

  it('skips rows with unparseable scope rather than throwing', async () => {
    // A single corrupt row must not 500 the whole endpoint and strand the
    // owner unable to revoke their other shares via the UI.
    const userId = await makeTestUser(prisma, 'share-list-corrupt');
    const good = await createShare(prisma, {
      userId,
      scope: { kind: 'topic', topicKey: 'iron' },
    });
    // Forge a corrupt row directly via Prisma — the public API won't let us
    // persist one, but the DB certainly can via migrations or manual edits.
    await prisma.sharedView.create({
      data: {
        userId,
        tokenHash: hashShareToken(generateRawShareToken()),
        scope: 'not json',
        expiresAt: null,
      },
    });
    await prisma.sharedView.create({
      data: {
        userId,
        tokenHash: hashShareToken(generateRawShareToken()),
        scope: JSON.stringify({ kind: 'topic' }), // missing topicKey
        expiresAt: null,
      },
    });

    const shares = await listSharesForUser(prisma, userId);
    expect(shares).toHaveLength(1);
    expect(shares[0].id).toBe(good.id);
  });
});

describe('resolveShare corrupt scope', () => {
  it('returns null for a row with unparseable scope rather than throwing', async () => {
    const userId = await makeTestUser(prisma, 'share-resolve-corrupt');
    const rawToken = generateRawShareToken();
    await prisma.sharedView.create({
      data: {
        userId,
        tokenHash: hashShareToken(rawToken),
        scope: 'this-is-not-json-at-all',
        expiresAt: null,
      },
    });
    const resolved = await resolveShare(prisma, rawToken);
    expect(resolved).toBeNull();
  });
});
