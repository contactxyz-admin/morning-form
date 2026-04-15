/**
 * Vitest global setup — runs once before any test file.
 *
 * Provisions a fresh SQLite test DB for graph integration tests so individual
 * test files can simply construct a PrismaClient pointing at it without each
 * file racing to wipe + push the schema.
 *
 * Tests must use unique userIds (see makeTestUser in src/lib/graph/test-db.ts)
 * so parallel-running test files do not collide on shared rows.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DB_PATH = path.resolve(process.cwd(), 'prisma/.test-graph.db');
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

export async function setup(): Promise<void> {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  for (const suffix of ['-journal', '-shm', '-wal']) {
    const stale = TEST_DB_PATH + suffix;
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }
  execSync('npx prisma db push --skip-generate --force-reset', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });
}

export async function teardown(): Promise<void> {
  // Leave the DB on disk so we can poke at it after a failed run; gitignored.
}
