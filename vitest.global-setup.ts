/**
 * Vitest global setup — runs once before any test file.
 *
 * Wipes and re-pushes the Prisma schema into the test Postgres DB so each
 * run starts clean. Individual test files construct PrismaClients pointing
 * at the same URL via getTestDbUrl() in src/lib/graph/test-db.ts.
 *
 * Tests must use unique userIds (see makeTestUser in src/lib/graph/test-db.ts)
 * so parallel-running test files do not collide on shared rows.
 */

import { execSync } from 'node:child_process';
import { getTestDbUrl } from './src/lib/graph/test-db';

export async function setup(): Promise<void> {
  execSync('npx prisma db push --skip-generate --force-reset', {
    env: { ...process.env, DATABASE_URL: getTestDbUrl() },
    stdio: 'pipe',
  });
}

export async function teardown(): Promise<void> {
  // Schema is wiped + re-pushed at the start of each run, so nothing to do.
}
