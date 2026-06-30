#!/usr/bin/env tsx
/**
 * Backfill TEMPORAL_SUCCEEDS edges over existing observation instances
 * (longitudinal-trajectory plan 2026-06-30-001 U3).
 *
 * Dated `observation` instances already exist (written on lab ingest, or
 * recovered by `backfill-lab-observations.ts`), but the succession between
 * consecutive readings was never linked as graph structure. This walks each
 * user's biomarker concepts and links consecutive instances earlier → later
 * with TEMPORAL_SUCCEEDS, making the trajectory graph-native.
 *
 * Idempotent (edges carry no fromChunkId, so addEdge's composite dedup makes
 * re-runs no-ops; keyed effectively by marker + the two instance ids). Safe to
 * re-run. Run AFTER backfill-lab-observations.ts so single-anchor markers have
 * their instance to link from.
 *
 * Run: tsx scripts/backfill-temporal-succeeds.ts [userId]
 *   - with a userId: backfill that user only.
 *   - without:       backfill every user.
 */
import { PrismaClient } from '@prisma/client';
import { linkTemporalSucceedsForUser } from '../src/lib/markers/temporal-succeeds';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const targetUserId = process.argv[2];
  try {
    const userIds = targetUserId
      ? [targetUserId]
      : (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

    let totalCreated = 0;
    for (const userId of userIds) {
      const res = await linkTemporalSucceedsForUser(prisma, userId);
      totalCreated += res.created;
      if (res.created > 0) {
        process.stdout.write(`[backfill-temporal] user=${userId} created=${res.created}\n`);
      }
    }
    process.stdout.write(
      `[backfill-temporal] done — ${userIds.length} user(s), ${totalCreated} edge(s) created.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`[backfill-temporal] failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
