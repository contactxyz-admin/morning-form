#!/usr/bin/env tsx
/**
 * One-off cleanup for legacy Scribe.model values from the pre-Anthropic
 * era. See docs/plans/2026-05-14-001-fix-scribe-model-anthropic-guard-plan.md.
 *
 * Symptom this fixes:
 *   Sending a chat on /ask returns 404 from the Anthropic SDK with
 *   message: `not_found_error: model: openrouter/openai/gpt-4.1`.
 *
 * Root cause:
 *   `Scribe.model` was populated months ago with OpenRouter-shaped
 *   strings when the app routed through a multi-provider gateway.
 *   `getOrCreateScribeForTopic` only creates, never updates — so
 *   existing rows are permanently stuck on the old strings.
 *
 * What this does:
 *   `prisma.scribe.updateMany` with a prefix filter on `openrouter/`,
 *   rewriting every legacy row to `DEFAULT_SCRIBE_MODEL` (currently
 *   `claude-sonnet-4-6`). Prefix match — not exact — so we catch every
 *   historical OpenRouter shape, not just the one that appeared in
 *   the bug report.
 *
 * Idempotency:
 *   `updateMany` with no matches returns count=0. Re-running after a
 *   clean DB is a no-op.
 *
 * Why this is safe to run any time:
 *   The execute.ts guard (`isAcceptableModelForCurrentClient`) already
 *   heals these rows at runtime. This script just removes dirty data
 *   so the guard becomes a defensive backstop rather than load-bearing.
 *
 * Run: `pnpm scribe:fix-model`
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_SCRIBE_MODEL } from '../src/lib/scribe/repo';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const before = await prisma.scribe.count({
      where: { model: { startsWith: 'openrouter/' } },
    });

    if (before === 0) {
      process.stdout.write('No legacy openrouter/ scribe rows to migrate.\n');
      return;
    }

    process.stdout.write(`Found ${before} scribe row(s) with stale openrouter/ model.\n`);

    const result = await prisma.scribe.updateMany({
      where: { model: { startsWith: 'openrouter/' } },
      data: { model: DEFAULT_SCRIBE_MODEL },
    });

    process.stdout.write(`Updated ${result.count} row(s) to model=${DEFAULT_SCRIBE_MODEL}.\n`);

    // Verify zero remain — belt-and-braces. If something else is still
    // writing OpenRouter strings concurrently, this surfaces it instead
    // of silently leaving rows dirty.
    const remaining = await prisma.scribe.count({
      where: { model: { startsWith: 'openrouter/' } },
    });
    if (remaining > 0) {
      process.stderr.write(
        `[fix-scribe-model] WARNING: ${remaining} openrouter/ rows remain after updateMany — concurrent writer?\n`,
      );
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(
    `[fix-scribe-model] failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
