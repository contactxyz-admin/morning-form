import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addNode } from '@/lib/graph/mutations';
import { resolveEntityHandler } from './resolve-entity';
import type { ToolContext } from './types';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

function makeCtx(userId: string): ToolContext {
  return { db: prisma, userId, topicKey: '__whole_graph__', requestId: 'test-req' };
}

describe('resolve_entity handler', () => {
  it('returns { found: true, node } for an existing canonicalKey', async () => {
    const userId = await makeTestUser(prisma, 'mcp-resolve-happy');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
    });

    const result = await resolveEntityHandler.execute(makeCtx(userId), {
      canonicalKey: 'ferritin',
    });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.node.canonicalKey).toBe('ferritin');
      expect(result.node.displayName).toBe('Ferritin');
      expect(result.node.type).toBe('biomarker');
      expect(typeof result.node.id).toBe('string');
      // Wire shape — timestamps are ISO strings.
      expect(typeof result.node.createdAt).toBe('string');
      expect(result.node.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('returns { found: false } for an unknown canonicalKey', async () => {
    const userId = await makeTestUser(prisma, 'mcp-resolve-unknown');
    const result = await resolveEntityHandler.execute(makeCtx(userId), {
      canonicalKey: 'never_seen_this_before',
    });

    expect(result.found).toBe(false);
  });

  it('does NOT return another user\'s node — cross-user lookup is { found: false }', async () => {
    const userA = await makeTestUser(prisma, 'mcp-resolve-userA');
    const userB = await makeTestUser(prisma, 'mcp-resolve-userB');
    await addNode(prisma, userA, {
      type: 'biomarker',
      canonicalKey: 'a_private_marker',
      displayName: "A's marker",
    });

    const result = await resolveEntityHandler.execute(makeCtx(userB), {
      canonicalKey: 'a_private_marker',
    });

    // Critical: the answer is `found: false`, not the other user's node id.
    // The API must not be usable as a probe for what's in someone else's vault.
    expect(result.found).toBe(false);
  });

  it('ignores ctx.topicKey (whole-graph contract)', async () => {
    const userId = await makeTestUser(prisma, 'mcp-resolve-topic-ignored');
    await addNode(prisma, userId, {
      type: 'biomarker',
      canonicalKey: 'cholesterol_apob',
      displayName: 'ApoB',
    });

    const r1 = await resolveEntityHandler.execute(
      { db: prisma, userId, topicKey: 'iron', requestId: 'r1' },
      { canonicalKey: 'cholesterol_apob' },
    );
    const r2 = await resolveEntityHandler.execute(
      { db: prisma, userId, topicKey: 'cardio', requestId: 'r2' },
      { canonicalKey: 'cholesterol_apob' },
    );

    expect(r1.found).toBe(true);
    expect(r2.found).toBe(true);
    if (r1.found && r2.found) expect(r1.node.id).toBe(r2.node.id);
  });
});
