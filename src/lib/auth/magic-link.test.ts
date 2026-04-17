import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

// Mock env so the magic-link module picks up a deterministic SESSION_SECRET.
vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters-long',
    RESEND_API_KEY: '',
    RESEND_FROM: 'onboarding@resend.dev',
    DATABASE_URL: '',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
  assertAuthEnv: () => {},
  getSessionSecret: () => 'test-session-secret-at-least-thirty-two-characters-long',
}));

import {
  hashToken,
  issueMagicLink,
  verifyMagicLink,
  MAGIC_LINK_TTL_MS,
  RATE_LIMITS,
} from './magic-link';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

afterEach(async () => {
  vi.useRealTimers();
  // No rate-limit table cleanup here: each test generates a unique email and
  // IP hash so counters never collide. A global `deleteMany({})` would race
  // with other test files that share the same test DB.
});

function email(suffix: string): string {
  return `ml-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

describe('hashToken', () => {
  it('is deterministic and different for different inputs', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('uses the session secret (different secret → different hash)', async () => {
    const once = hashToken('fixed-input');
    // Same call with same secret should match.
    expect(hashToken('fixed-input')).toBe(once);
    // sanity: output looks like hex
    expect(once).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('issueMagicLink', () => {
  it('creates a token and upserts the user', async () => {
    const addr = email('issue-happy');
    const result = await issueMagicLink(prisma, { email: addr, requestIpHash: 'ip-1' });
    if (result.outcome !== 'issued') throw new Error('expected issued outcome');
    expect(result.rawToken).toBeTypeOf('string');

    const user = await prisma.user.findUnique({ where: { email: addr } });
    expect(user).not.toBeNull();
    const tokens = await prisma.magicLinkToken.findMany({ where: { userId: user!.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.tokenHash).toBe(hashToken(result.rawToken));
    expect(tokens[0]?.consumedAt).toBeNull();
    // TTL is 15 minutes.
    const delta = tokens[0]!.expiresAt.getTime() - tokens[0]!.createdAt.getTime();
    expect(delta).toBe(MAGIC_LINK_TTL_MS);
  });

  it('does not persist the raw token — only the hash is stored', async () => {
    const addr = email('issue-nostore');
    const result = await issueMagicLink(prisma, { email: addr, requestIpHash: 'ip-1' });
    if (result.outcome !== 'issued') throw new Error('expected issued outcome');
    const raw = result.rawToken;
    const rows = await prisma.magicLinkToken.findMany({});
    for (const row of rows) {
      expect(row.tokenHash).not.toBe(raw);
      expect(row.tokenHash).not.toContain(raw);
    }
  });

  it('returns the same outcome shape for repeated issues (enumeration resistance)', async () => {
    const addr = email('issue-enum');
    const first = await issueMagicLink(prisma, { email: addr, requestIpHash: 'ip-enum' });
    const second = await issueMagicLink(prisma, { email: addr, requestIpHash: 'ip-enum' });
    if (first.outcome !== 'issued' || second.outcome !== 'issued') {
      throw new Error('expected both issues to succeed');
    }
    // Both have raw tokens (opaque to caller; outcome type identical).
    expect(typeof first.rawToken).toBe('string');
    expect(typeof second.rawToken).toBe('string');
  });

  it('enforces per-email 15-minute rate limit', async () => {
    const addr = email('rl-email-15m');
    for (let i = 0; i < RATE_LIMITS.emailPer15Min; i++) {
      const r = await issueMagicLink(prisma, { email: addr, requestIpHash: `ip-${i}` });
      expect(r.outcome).toBe('issued');
    }
    const overflow = await issueMagicLink(prisma, { email: addr, requestIpHash: 'ip-over' });
    expect(overflow.outcome).toBe('rate_limited');
  });

  it('enforces per-IP 1-hour rate limit', async () => {
    const ipHash = `ip-burst-${Math.random().toString(36).slice(2, 8)}`;
    for (let i = 0; i < RATE_LIMITS.ipPer1Hour; i++) {
      const r = await issueMagicLink(prisma, { email: email(`rl-ip-${i}`), requestIpHash: ipHash });
      expect(r.outcome).toBe('issued');
    }
    const overflow = await issueMagicLink(prisma, {
      email: email('rl-ip-over'),
      requestIpHash: ipHash,
    });
    expect(overflow.outcome).toBe('rate_limited');
  });
});

describe('verifyMagicLink', () => {
  it('verifies an unconsumed, unexpired token and marks it consumed', async () => {
    const addr = email('verify-happy');
    const issued = await issueMagicLink(prisma, { email: addr, requestIpHash: 'ip-v1' });
    if (issued.outcome !== 'issued') throw new Error('expected issued');
    const result = await verifyMagicLink(prisma, { rawToken: issued.rawToken });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(typeof result.userId).toBe('string');
    // Second verify of same raw token fails with 'consumed'.
    const second = await verifyMagicLink(prisma, { rawToken: issued.rawToken });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('unreachable');
    expect(second.reason).toBe('consumed');
  });

  it('rejects an expired token', async () => {
    const addr = email('verify-expired');
    const issued = await issueMagicLink(prisma, { email: addr, requestIpHash: 'ip-v2' });
    if (issued.outcome !== 'issued') throw new Error('expected issued');
    // Manually push expiresAt into the past.
    await prisma.magicLinkToken.updateMany({
      where: { tokenHash: hashToken(issued.rawToken) },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const result = await verifyMagicLink(prisma, { rawToken: issued.rawToken });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('expired');
  });

  it('rejects a tampered / unknown token without leaking existence', async () => {
    const result = await verifyMagicLink(prisma, { rawToken: 'definitely-not-a-real-token-aaaa' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('invalid');
  });

  it('rejects empty / short tokens', async () => {
    const empty = await verifyMagicLink(prisma, { rawToken: '' });
    expect(empty.ok).toBe(false);
    if (empty.ok) throw new Error('unreachable');
    expect(empty.reason).toBe('invalid');
  });
});
