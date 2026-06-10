#!/usr/bin/env tsx
/**
 * Backfill dated observation instances for existing biomarker concepts
 * (longitudinal plan 2026-06-10-002 U8).
 *
 * Pre-migration lab uploads wrote only the biomarker concept node, and
 * first-write-wins kept just the first panel's value. This recovers that one
 * surviving reading as an `observation` instance (INSTANCE_OF the concept) so
 * pre-existing markers show a trajectory point. It cannot recover values that
 * first-write-wins already discarded — those return as the user re-uploads,
 * which now accumulates correctly.
 *
 * Idempotent (instances key on obs_<marker>_<yyyy_mm_dd>; addNode/addEdge
 * upsert). Safe to re-run.
 *
 * Run: tsx scripts/backfill-lab-observations.ts [userId]
 *   - with a userId: backfill that user only.
 *   - without:       backfill every user.
 */
import { PrismaClient } from '@prisma/client';
import { backfillObservationsForUser } from '../src/lib/markers/backfill-observations';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const targetUserId = process.argv[2];
  try {
    const userIds = targetUserId
      ? [targetUserId]
      : (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

    let totalCreated = 0;
    for (const userId of userIds) {
      const res = await backfillObservationsForUser(prisma, userId);
      totalCreated += res.created;
      if (res.created > 0 || res.scanned > 0) {
        process.stdout.write(
          `[backfill] user=${userId} scanned=${res.scanned} created=${res.created} skipped=${res.skipped}\n`,
        );
      }
    }
    process.stdout.write(
      `[backfill] done — ${userIds.length} user(s), ${totalCreated} instance(s) created.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`[backfill] failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
