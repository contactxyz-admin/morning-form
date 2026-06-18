/**
 * GET /api/cron/retest-nudge — the retest nudge cron (Plan 2026-06-17-001 U3).
 *
 * Invoked daily by Vercel Cron (see vercel.json), which sends
 * `Authorization: Bearer ${CRON_SECRET}`. Flag-gated behind RETEST_LOOP_ENABLED
 * and secret-gated behind CRON_SECRET (mirrors the OPS_SECRET booking-ops idiom).
 * Idempotent: re-running on the same day sends nothing extra (the nudge-sequence
 * offsets are days apart). Returns a JSON run summary.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { runRetestNudges } from '@/lib/retest/nudge';
import { sendRetestNudgeEmail } from '@/lib/retest/nudge-email';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  if (env.RETEST_LOOP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  // Secret-gated. A missing CRON_SECRET fails closed (every request → 401).
  const auth = req.headers.get('authorization');
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const summary = await runRetestNudges(prisma, async ({ recipient, offsetIndex }) => {
    await sendRetestNudgeEmail({ to: recipient.email, name: recipient.name, offsetIndex });
  });

  return NextResponse.json({ ok: true, ...summary });
}
