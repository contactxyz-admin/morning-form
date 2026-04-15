/**
 * Per-process SQLite test DB for graph layer integration tests.
 *
 * Why a real DB instead of mocks: graph operations exercise real upserts,
 * unique constraints, multi-row transactions, and JSON column round-trips
 * — all of which are pointless to mock and easy to get wrong if mocked.
 *
 * The DB lives at prisma/.test-graph.db (gitignored). Each test file is
 * expected to call `setupTestDb()` in beforeAll and `teardownTestDb()` in
 * afterAll. Each test should use a unique userId so parallel-running tests
 * don't collide on shared rows.
 */

import path from 'node:path';
import { PrismaClient } from '@prisma/client';

// The DB itself is provisioned once by vitest.global-setup.ts; this helper
// only opens a per-file PrismaClient against it.
const TEST_DB_PATH = path.resolve(process.cwd(), 'prisma/.test-graph.db');
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

let client: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!client) throw new Error('Test DB not initialised — call setupTestDb() in beforeAll');
  return client;
}

export async function setupTestDb(): Promise<PrismaClient> {
  client = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  return client;
}

export async function teardownTestDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

export async function makeTestUser(prisma: PrismaClient, suffix: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `test+${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com` },
  });
  return user.id;
}
