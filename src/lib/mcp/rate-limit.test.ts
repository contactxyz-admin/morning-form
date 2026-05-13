import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { createMcpToken } from './tokens';
import {
  MCP_RATE_LIMIT_PER_WINDOW,
  MCP_RATE_LIMIT_WINDOW_MS,
  checkMcpRateLimit,
} from './rate-limit';
import { writeMcpAuditEvent } from './audit';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

async function seedAuditEvents(
  tokenId: string,
  userId: string,
  count: number,
  perEventOffsetMs = 0,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await writeMcpAuditEvent(prisma, {
      tokenId,
      userId,
      toolName: 'list_graph_index',
      parameters: {},
      resultStatus: 'success',
      latencyMs: 1,
    });
    if (perEventOffsetMs > 0) await new Promise((r) => setTimeout(r, perEventOffsetMs));
  }
}

describe('checkMcpRateLimit', () => {
  // No deleteMany — every test creates its own user + token so audit
  // rows are naturally scoped by tokenId. A wipe-per-test would race
  // against other test files sharing the same test DB.

  it('allows the first call (zero history)', async () => {
    const userId = await makeTestUser(prisma, 'rl-first');
    const { id } = await createMcpToken(prisma, { userId, label: 'first' });

    const result = await checkMcpRateLimit(prisma, id);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MCP_RATE_LIMIT_PER_WINDOW);
    expect(result.retryAfter).toBeUndefined();
  });

  it('reports remaining count correctly as calls accumulate', async () => {
    const userId = await makeTestUser(prisma, 'rl-remaining');
    const { id } = await createMcpToken(prisma, { userId, label: 'remaining' });

    await seedAuditEvents(id, userId, 5);
    const result = await checkMcpRateLimit(prisma, id);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MCP_RATE_LIMIT_PER_WINDOW - 5);
  });

  it('blocks when the count hits the per-window cap', async () => {
    const userId = await makeTestUser(prisma, 'rl-blocked');
    const { id } = await createMcpToken(prisma, { userId, label: 'blocked' });

    await seedAuditEvents(id, userId, MCP_RATE_LIMIT_PER_WINDOW);
    const result = await checkMcpRateLimit(prisma, id);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
    // retryAfter should never exceed the full window (cold cache, no
    // rows-in-window query result fallback).
    expect(result.retryAfter).toBeLessThanOrEqual(MCP_RATE_LIMIT_WINDOW_MS / 1000);
  });

  it('isolates rate limits per token (token A throttled, token B unaffected)', async () => {
    const userId = await makeTestUser(prisma, 'rl-isolated');
    const { id: tokenA } = await createMcpToken(prisma, { userId, label: 'A' });
    const { id: tokenB } = await createMcpToken(prisma, { userId, label: 'B' });

    await seedAuditEvents(tokenA, userId, MCP_RATE_LIMIT_PER_WINDOW);

    const resultA = await checkMcpRateLimit(prisma, tokenA);
    const resultB = await checkMcpRateLimit(prisma, tokenB);

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(MCP_RATE_LIMIT_PER_WINDOW);
  });

  it('audit rows OUTSIDE the window do not count toward the limit', async () => {
    const userId = await makeTestUser(prisma, 'rl-window');
    const { id } = await createMcpToken(prisma, { userId, label: 'window' });

    // Seed N events but force their createdAt to be more than the window ago.
    const cutoff = new Date(Date.now() - MCP_RATE_LIMIT_WINDOW_MS - 5_000);
    for (let i = 0; i < MCP_RATE_LIMIT_PER_WINDOW + 5; i++) {
      await prisma.mCPAuditEvent.create({
        data: {
          tokenId: id,
          userId,
          toolName: 'list_graph_index',
          parameters: '{}',
          resultStatus: 'success',
          latencyMs: 1,
          createdAt: cutoff,
        },
      });
    }

    const result = await checkMcpRateLimit(prisma, id);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MCP_RATE_LIMIT_PER_WINDOW);
  });
});
