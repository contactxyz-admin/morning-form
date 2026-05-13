import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  createMcpToken,
  findMcpTokenByRaw,
  generateRawMcpToken,
  hashMcpToken,
  listMcpTokensForUser,
  markMcpTokenUsed,
  revokeMcpToken,
} from './tokens';
import { hashShareToken } from '@/lib/share/tokens';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('hashMcpToken', () => {
  it('is deterministic for the same input', () => {
    const a = hashMcpToken('abc');
    const b = hashMcpToken('abc');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('differs between tokens', () => {
    expect(hashMcpToken('a')).not.toBe(hashMcpToken('b'));
  });

  it('domain-separated from share tokens (same raw, different hash)', () => {
    // The whole point of HMAC + domain prefix: a raw value that hashes one
    // way as a share token must hash a different way as an MCP token, so
    // tokens cannot be cross-redeemed even if an attacker had both hashes.
    const raw = generateRawMcpToken();
    expect(hashMcpToken(raw)).not.toBe(hashShareToken(raw));
  });
});

describe('generateRawMcpToken', () => {
  it('produces 43-char base64url strings (32 bytes)', () => {
    const raw = generateRawMcpToken();
    expect(raw).toHaveLength(43);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates unique tokens across calls', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateRawMcpToken()));
    expect(tokens.size).toBe(100);
  });
});

describe('createMcpToken / findMcpTokenByRaw', () => {
  it('round-trips a fresh token', async () => {
    const userId = await makeTestUser(prisma, 'mcp-create');
    const { id, rawToken, label, expiresAt } = await createMcpToken(prisma, {
      userId,
      label: 'Claude Desktop',
    });
    expect(label).toBe('Claude Desktop');
    expect(expiresAt).toBeNull();
    expect(rawToken).toHaveLength(43);

    const resolved = await findMcpTokenByRaw(prisma, rawToken);
    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe(id);
    expect(resolved?.userId).toBe(userId);
    expect(resolved?.label).toBe('Claude Desktop');
    expect(resolved?.useCount).toBe(0);
    expect(resolved?.lastUsedAt).toBeNull();
  });

  it('rejects unknown tokens', async () => {
    const resolved = await findMcpTokenByRaw(prisma, generateRawMcpToken());
    expect(resolved).toBeNull();
  });

  it('rejects empty / null / non-string tokens', async () => {
    expect(await findMcpTokenByRaw(prisma, '')).toBeNull();
    // @ts-expect-error — intentional bad input
    expect(await findMcpTokenByRaw(prisma, null)).toBeNull();
    // @ts-expect-error — intentional bad input
    expect(await findMcpTokenByRaw(prisma, 123)).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const userId = await makeTestUser(prisma, 'mcp-expired');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { rawToken } = await createMcpToken(prisma, {
      userId,
      label: 'Expired',
      expiresAt: yesterday,
    });
    expect(await findMcpTokenByRaw(prisma, rawToken)).toBeNull();
  });

  it('accepts a token that expires in the future', async () => {
    const userId = await makeTestUser(prisma, 'mcp-future');
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { rawToken } = await createMcpToken(prisma, {
      userId,
      label: 'Future',
      expiresAt: tomorrow,
    });
    const resolved = await findMcpTokenByRaw(prisma, rawToken);
    expect(resolved?.expiresAt?.getTime()).toBe(tomorrow.getTime());
  });
});

describe('markMcpTokenUsed', () => {
  it('increments useCount and sets lastUsedAt', async () => {
    const userId = await makeTestUser(prisma, 'mcp-used');
    const { id, rawToken } = await createMcpToken(prisma, { userId, label: 'used' });

    await markMcpTokenUsed(prisma, id);
    await markMcpTokenUsed(prisma, id);

    const resolved = await findMcpTokenByRaw(prisma, rawToken);
    expect(resolved?.useCount).toBe(2);
    expect(resolved?.lastUsedAt).toBeInstanceOf(Date);
  });
});

describe('revokeMcpToken', () => {
  it('revokes an active token and rejects findMcpTokenByRaw afterwards', async () => {
    const userId = await makeTestUser(prisma, 'mcp-revoke');
    const { id, rawToken } = await createMcpToken(prisma, { userId, label: 'revoke me' });

    expect(await findMcpTokenByRaw(prisma, rawToken)).not.toBeNull();
    const ok = await revokeMcpToken(prisma, userId, id);
    expect(ok).toBe(true);
    expect(await findMcpTokenByRaw(prisma, rawToken)).toBeNull();
  });

  it('idempotent re-revocation returns true', async () => {
    const userId = await makeTestUser(prisma, 'mcp-idempotent');
    const { id } = await createMcpToken(prisma, { userId, label: 'twice' });

    expect(await revokeMcpToken(prisma, userId, id)).toBe(true);
    expect(await revokeMcpToken(prisma, userId, id)).toBe(true);
  });

  it('cross-user revoke returns false (auth boundary)', async () => {
    const userA = await makeTestUser(prisma, 'mcp-userA');
    const userB = await makeTestUser(prisma, 'mcp-userB');
    const { id } = await createMcpToken(prisma, { userId: userA, label: 'A token' });

    expect(await revokeMcpToken(prisma, userB, id)).toBe(false);
  });

  it('unknown token id returns false', async () => {
    const userId = await makeTestUser(prisma, 'mcp-unknown-revoke');
    expect(await revokeMcpToken(prisma, userId, 'non-existent-id')).toBe(false);
  });
});

describe('listMcpTokensForUser', () => {
  it('returns tokens in reverse-chronological order, scoped to the user', async () => {
    const userA = await makeTestUser(prisma, 'mcp-listA');
    const userB = await makeTestUser(prisma, 'mcp-listB');

    await createMcpToken(prisma, { userId: userA, label: 'A1' });
    await new Promise((r) => setTimeout(r, 10));
    await createMcpToken(prisma, { userId: userA, label: 'A2' });
    await createMcpToken(prisma, { userId: userB, label: 'B1' });

    const aTokens = await listMcpTokensForUser(prisma, userA);
    expect(aTokens).toHaveLength(2);
    expect(aTokens[0].label).toBe('A2');
    expect(aTokens[1].label).toBe('A1');

    const bTokens = await listMcpTokensForUser(prisma, userB);
    expect(bTokens).toHaveLength(1);
    expect(bTokens[0].label).toBe('B1');
  });

  it('includes revoked tokens so users can audit history', async () => {
    const userId = await makeTestUser(prisma, 'mcp-list-revoked');
    const { id } = await createMcpToken(prisma, { userId, label: 'soon-revoked' });
    await revokeMcpToken(prisma, userId, id);

    const tokens = await listMcpTokensForUser(prisma, userId);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].revokedAt).not.toBeNull();
  });
});
