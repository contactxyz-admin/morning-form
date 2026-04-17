import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  getTestPrisma,
  makeTestUser,
  setupTestDb,
  teardownTestDb,
} from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';

const currentUserMock = vi.fn<() => Promise<{ id: string } | null>>();

vi.mock('@/lib/db', () => ({
  get prisma() {
    return getTestPrisma();
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: () => currentUserMock(),
}));

// The route uses env.NEXT_PUBLIC_APP_URL to build the share URL — pin it here
// so host-header spoofing tests can assert the response doesn't reflect the
// Host header under any circumstances.
vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'https://app.contact.xyz',
    SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters-long',
    RESEND_API_KEY: '',
    RESEND_FROM: 'onboarding@resend.dev',
    DATABASE_URL: '',
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
});

function makeRequest(body: unknown, init: { host?: string } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.host) headers['x-forwarded-host'] = init.host;
  return new Request(`https://${init.host ?? 'app.test'}/api/share/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/share/create', () => {
  it('returns 401 when no user is signed in', async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ scope: { kind: 'topic', topicKey: 'iron' } }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 422 on invalid body', async () => {
    currentUserMock.mockResolvedValue({ id: await makeTestUser(prisma, 'share-422') });
    const res = await POST(makeRequest({ scope: { kind: 'bogus' } }));
    expect(res.status).toBe(422);
  });

  it('happy path — topic scope returns a token, URL, and persists a SharedView row', async () => {
    const userId = await makeTestUser(prisma, 'share-happy');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(
      makeRequest({
        scope: { kind: 'topic', topicKey: 'iron' },
        label: 'For Dr. Smith',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rawToken).toBeTypeOf('string');
    expect(body.url).toBe(`https://app.contact.xyz/share/${body.rawToken}`);

    const rows = await prisma.sharedView.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('For Dr. Smith');
  });

  it('refuses to mint a node-scope share for a node owned by another user (IDOR)', async () => {
    // The attacker must get a 404 — not 400 or 403 — so they cannot enumerate
    // valid node ids belonging to other users. Crucially, no SharedView row
    // must exist for the attacker afterwards: the ownership check must fire
    // BEFORE createShare writes to the DB.
    const ownerId = await makeTestUser(prisma, 'share-idor-owner');
    const attackerId = await makeTestUser(prisma, 'share-idor-attacker');
    const ownedNode = await addNode(prisma, ownerId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });

    currentUserMock.mockResolvedValue({ id: attackerId });
    const res = await POST(
      makeRequest({ scope: { kind: 'node', nodeId: ownedNode.id } }),
    );
    expect(res.status).toBe(404);

    const attackerShares = await prisma.sharedView.findMany({ where: { userId: attackerId } });
    expect(attackerShares).toHaveLength(0);
    // And no share mysteriously got attributed to the owner either.
    const ownerShares = await prisma.sharedView.findMany({ where: { userId: ownerId } });
    expect(ownerShares).toHaveLength(0);
  });

  it('allows a node-scope share when the caller owns the node', async () => {
    const userId = await makeTestUser(prisma, 'share-node-owner');
    const node = await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(
      makeRequest({ scope: { kind: 'node', nodeId: node.id } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe(`https://app.contact.xyz/share/${body.rawToken}`);
  });

  it('builds the share URL from NEXT_PUBLIC_APP_URL, ignoring a spoofed Host header', async () => {
    // Host-header injection: a malicious upstream can inject an X-Forwarded-Host
    // that nextUrl.origin will reflect. If the route used that to mint the URL,
    // the owner would receive a link pointing at an attacker-controlled host —
    // the token wouldn't work there, but the link could be forwarded straight
    // into a phishing vector before anyone notices. The URL MUST come from
    // our env, not the request.
    const userId = await makeTestUser(prisma, 'share-host-spoof');
    currentUserMock.mockResolvedValue({ id: userId });
    const res = await POST(
      makeRequest(
        { scope: { kind: 'topic', topicKey: 'iron' } },
        { host: 'evil.example.com' },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url.startsWith('https://app.contact.xyz/share/')).toBe(true);
    expect(body.url).not.toMatch(/evil\.example\.com/);
  });
});
