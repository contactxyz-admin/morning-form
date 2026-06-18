#!/usr/bin/env tsx
/**
 * Backfill baseline draws for existing users (Plan 2026-06-17-001 U5).
 *
 * Gives each user who has lab panels but no Draw rows a single completed
 * baseline draw tagged `attribution = 'backfill'` (excluded from the forward-only
 * retention headline) and schedules their next retest so the nudge cron can
 * re-engage them. Run DARK — before flipping RETEST_LOOP_ENABLED. Idempotent.
 *
 * Run:
 *   tsx scripts/retest/backfill-baseline-draws.ts            # DRY RUN (default)
 *   tsx scripts/retest/backfill-baseline-draws.ts --apply    # write
 *   tsx scripts/retest/backfill-baseline-draws.ts <userId>   # one user (dry run)
 *   tsx scripts/retest/backfill-baseline-draws.ts <userId> --apply
 */
import { PrismaClient } from '@prisma/client';
import { backfillBaselineDrawForUser } from '../../src/lib/retest/backfill';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const targetUserId = args.find((a) => !a.startsWith('--'));

  const prisma = new PrismaClient();
  try {
    const userIds = targetUserId
      ? [targetUserId]
      : (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

    const counts = { created: 0, wouldCreate: 0, skippedHasDraws: 0, skippedNoLabs: 0 };
    for (const userId of userIds) {
      const res = await backfillBaselineDrawForUser(prisma, userId, { apply });
      if (res.status === 'created' || res.status === 'would-create') {
        if (res.status === 'created') counts.created++;
        else counts.wouldCreate++;
        process.stdout.write(
          `[backfill] ${res.status} user=${userId} baseline=${res.baselineAt?.toISOString().slice(0, 10)} ` +
            `nextRetest=${res.nextScheduledFor?.toISOString().slice(0, 10)}\n`,
        );
      } else if (res.status === 'skipped-has-draws') {
        counts.skippedHasDraws++;
      } else {
        counts.skippedNoLabs++;
      }
    }

    process.stdout.write(
      `[backfill] done — ${userIds.length} user(s): created=${counts.created} ` +
        `wouldCreate=${counts.wouldCreate} skippedHasDraws=${counts.skippedHasDraws} ` +
        `skippedNoLabs=${counts.skippedNoLabs}\n`,
    );
    if (!apply) {
      process.stdout.write('[backfill] DRY RUN — nothing written. Re-run with --apply to write.\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`[backfill] failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
