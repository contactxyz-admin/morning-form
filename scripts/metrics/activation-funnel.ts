#!/usr/bin/env tsx
/**
 * Activation-funnel CLI — see
 * docs/plans/2026-04-21-002-feat-activation-funnel-instrumentation-plan.md.
 *
 * Prints CSV (pipe-into-a-sheet) + a human-readable summary for a cohort
 * defined by a signup-date window and/or an explicit userIds list.
 *
 * Examples:
 *   npx tsx scripts/metrics/activation-funnel.ts \
 *     --signup-since 2026-03-22 --signup-until 2026-04-21
 *   npx tsx scripts/metrics/activation-funnel.ts \
 *     --user-ids user_abc,user_def --retention-window-days 14
 */

import { PrismaClient } from '@prisma/client';
import { computeActivationFunnel } from '../../src/lib/metrics/activation-funnel-report';
import {
  formatCsv,
  formatSummary,
  InvalidCliArgsError,
  parseArgs,
  toComputeArgs,
} from '../../src/lib/metrics/activation-funnel-format';

async function main(): Promise<void> {
  let prisma: PrismaClient | null = null;
  try {
    const parsed = parseArgs(process.argv.slice(2));
    prisma = new PrismaClient();
    const report = await computeActivationFunnel({
      ...toComputeArgs(parsed),
      prisma,
    });
    process.stdout.write(formatCsv(report));
    process.stdout.write('\n\n');
    process.stdout.write(formatSummary(report));
    process.stdout.write('\n');
  } catch (err) {
    const message =
      err instanceof InvalidCliArgsError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    process.stderr.write(`activation-funnel: ${message}\n`);
    process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

void main();
