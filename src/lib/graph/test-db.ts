/**
 * Per-process Postgres test DB for graph layer integration tests.
 *
 * Why a real DB instead of mocks: graph operations exercise real upserts,
 * unique constraints, multi-row transactions, and JSON column round-trips
 * — all of which are pointless to mock and easy to get wrong if mocked.
 *
 * The test DB URL is read from TEST_DATABASE_URL, defaulting to a local
 * Postgres instance. The schema is wiped + re-pushed once per run by
 * vitest.global-setup.ts. Each test file calls `setupTestDb()` in beforeAll
 * and `teardownTestDb()` in afterAll, and each test should use a unique
 * userId so parallel-running tests don't collide on shared rows.
 */

import { PrismaClient } from '@prisma/client';

export function getTestDbUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const user = process.env.PGUSER ?? process.env.USER ?? 'postgres';
  return `postgres://${user}@localhost:5432/morning_form_test`;
}

let client: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!client) throw new Error('Test DB not initialised — call setupTestDb() in beforeAll');
  return client;
}

export async function setupTestDb(): Promise<PrismaClient> {
  client = new PrismaClient({ datasources: { db: { url: getTestDbUrl() } } });
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
