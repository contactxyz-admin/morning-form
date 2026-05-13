import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

// In-memory cookie jar so createSession via session.ts doesn't need next/headers.
const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

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

import { createSession } from '@/lib/session';
import { findMcpTokenByRaw } from '@/lib/mcp/tokens';
import { GET, POST } from './route';
import { DELETE } from './[id]/route';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(() => {
  cookieJar.clear();
});

/**
 * Sign in a freshly-created user by minting a session and setting the
 * cookie jar. Returns the user id so the test can verify scoping.
 */
async function signIn(suffix: string): Promise<string> {
  const userId = await makeTestUser(prisma, suffix);
  await createSession(userId);
  return userId;
}

function jsonRequest(url: string, body: object): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/mcp/tokens', () => {
  it('401 when not signed in', async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns the signed-in user\'s tokens, newest first, scoped to that user', async () => {
    const userA = await signIn('mcp-tokens-listA');
    // Issue two tokens on user A.
    await POST(jsonRequest('http://localhost/api/mcp/tokens', { label: 'A1' }));
    await new Promise((r) => setTimeout(r, 5));
    await POST(jsonRequest('http://localhost/api/mcp/tokens', { label: 'A2' }));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: Array<{ label: string; userId?: string }> };
    expect(body.tokens.map((t) => t.label)).toEqual(['A2', 'A1']);
    // Wire shape: no rawToken in list response (only POST surfaces it).
    expect(body.tokens[0]).not.toHaveProperty('rawToken');
    // Wire shape: userId not leaked.
    expect(body.tokens[0]).not.toHaveProperty('userId');

    // Sign in as user B; their list should be empty.
    cookieJar.clear();
    await signIn('mcp-tokens-listB');
    const resB = await GET();
    const bodyB = (await resB.json()) as { tokens: unknown[] };
    expect(bodyB.tokens).toEqual([]);
    // userA scoping check (silences unused-var lint without changing semantics).
    expect(userA).toBeTruthy();
  });

  it('Cache-Control header is no-store, private', async () => {
    await signIn('mcp-tokens-cache');
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('no-store, private');
    expect(res.headers.get('Vary')).toBe('Cookie');
  });
});

describe('POST /api/mcp/tokens', () => {
  it('401 when not signed in', async () => {
    const res = await POST(jsonRequest('http://localhost/api/mcp/tokens', { label: 'nope' }));
    expect(res.status).toBe(401);
  });

  it('422 on missing label', async () => {
    await signIn('mcp-tokens-422a');
    const res = await POST(jsonRequest('http://localhost/api/mcp/tokens', {}));
    expect(res.status).toBe(422);
  });

  it('422 on empty label', async () => {
    await signIn('mcp-tokens-422b');
    const res = await POST(jsonRequest('http://localhost/api/mcp/tokens', { label: '' }));
    expect(res.status).toBe(422);
  });

  it('issues a token and surfaces the raw value exactly once', async () => {
    await signIn('mcp-tokens-issue');
    const res = await POST(jsonRequest('http://localhost/api/mcp/tokens', { label: 'Claude Desktop' }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      id: string;
      label: string;
      rawToken: string;
      expiresAt: string | null;
    };
    expect(body.label).toBe('Claude Desktop');
    expect(body.rawToken).toHaveLength(43); // 32-byte base64url
    expect(body.id).toBeTruthy();

    // Persisted hash should resolve back to the same id.
    const resolved = await findMcpTokenByRaw(prisma, body.rawToken);
    expect(resolved?.id).toBe(body.id);
  });

  it('422 once the user is at the active-token cap (closes adv-mcp-010)', async () => {
    const userId = await signIn('mcp-tokens-cap');
    // Burn 20 active tokens directly via Prisma — faster than 20 POSTs and
    // tests the cap independent of POST's own correctness.
    await prisma.mCPToken.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        userId,
        tokenHash: `cap-test-hash-${i}-${Date.now()}`,
        label: `slot-${i}`,
      })),
    });

    const res = await POST(
      jsonRequest('http://localhost/api/mcp/tokens', { label: '21st' }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/active token limit/i);
    expect(body.error).toMatch(/20/);

    // Revoke one — should free a slot.
    const oldest = await prisma.mCPToken.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    await prisma.mCPToken.update({
      where: { id: oldest!.id },
      data: { revokedAt: new Date() },
    });

    const res2 = await POST(
      jsonRequest('http://localhost/api/mcp/tokens', { label: 'after-revoke' }),
    );
    expect(res2.status).toBe(200);
  });

  it('expired tokens do not count toward the cap', async () => {
    const userId = await signIn('mcp-tokens-cap-expired');
    // 20 already-expired tokens — should NOT block a 21st (active) issue.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.mCPToken.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        userId,
        tokenHash: `expired-${i}-${Date.now()}`,
        label: `old-${i}`,
        expiresAt: yesterday,
      })),
    });

    const res = await POST(
      jsonRequest('http://localhost/api/mcp/tokens', { label: 'fresh' }),
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/mcp/tokens/[id]', () => {
  it('401 when not signed in', async () => {
    const res = await DELETE(new Request('http://localhost/api/mcp/tokens/x', { method: 'DELETE' }), {
      params: { id: 'x' },
    });
    expect(res.status).toBe(401);
  });

  it('revokes a user\'s own token (idempotent re-call also returns 200)', async () => {
    await signIn('mcp-tokens-revoke');
    const issueRes = await POST(
      jsonRequest('http://localhost/api/mcp/tokens', { label: 'to-revoke' }),
    );
    const issued = (await issueRes.json()) as { id: string; rawToken: string };

    // First revoke — 200.
    const res1 = await DELETE(
      new Request(`http://localhost/api/mcp/tokens/${issued.id}`, { method: 'DELETE' }),
      { params: { id: issued.id } },
    );
    expect(res1.status).toBe(200);

    // Token resolution should now fail.
    expect(await findMcpTokenByRaw(prisma, issued.rawToken)).toBeNull();

    // Second revoke — idempotent, also 200.
    const res2 = await DELETE(
      new Request(`http://localhost/api/mcp/tokens/${issued.id}`, { method: 'DELETE' }),
      { params: { id: issued.id } },
    );
    expect(res2.status).toBe(200);
  });

  it('404 for a token belonging to another user (auth boundary)', async () => {
    // Issue from user A.
    await signIn('mcp-tokens-crossA');
    const issueRes = await POST(
      jsonRequest('http://localhost/api/mcp/tokens', { label: 'A only' }),
    );
    const issued = (await issueRes.json()) as { id: string };

    // Switch to user B and try to revoke A's token.
    cookieJar.clear();
    await signIn('mcp-tokens-crossB');
    const res = await DELETE(
      new Request(`http://localhost/api/mcp/tokens/${issued.id}`, { method: 'DELETE' }),
      { params: { id: issued.id } },
    );

    // 404 (not 403) so the existence of A's token doesn't leak to user B.
    expect(res.status).toBe(404);
  });

  it('404 for an unknown token id', async () => {
    await signIn('mcp-tokens-unknown');
    const res = await DELETE(
      new Request('http://localhost/api/mcp/tokens/does-not-exist', { method: 'DELETE' }),
      { params: { id: 'does-not-exist' } },
    );
    expect(res.status).toBe(404);
  });
});
