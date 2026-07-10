/**
 * GET /api/cron/ops-digest — the Friday weekly ops digest (see vercel.json).
 *
 * Invoked by Vercel Cron with `Authorization: Bearer ${CRON_SECRET}`.
 * Flag-gated behind COMPANY_OPS_ENABLED and secret-gated behind CRON_SECRET
 * (mirrors /api/cron/retest-nudge). Sends the digest email to every
 * configured founder and posts it to the ops Slack webhook if set; the
 * outcome lands in one CompanyOpsAudit row.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { bearerAuthorized } from '@/lib/auth/bearer';
import { sendEmail } from '@/lib/auth/email';
import { isCompanyOpsEnabled, members } from '@/lib/ops/config';
import { getOpsFocus, listOpsContacts, listOpsTasks } from '@/lib/ops/queries';
import { serializeOpsContact, serializeOpsTask } from '@/lib/ops/serialize';
import { buildOpsDigest } from '@/lib/ops/digest';
import { postToSlack } from '@/lib/ops/notify';
import { writeOpsAudit } from '@/lib/ops/audit';
import { currentWeekStartUtc, parseFocusItems } from '@/app/ops/intelligence';

export const dynamic = 'force-dynamic';

const DONE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: Request): Promise<Response> {
  if (!isCompanyOpsEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!bearerAuthorized(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const now = new Date();
  const [tasks, contacts, focusRow] = await Promise.all([
    listOpsTasks(prisma, { board: 'pilot' }),
    listOpsContacts(prisma),
    getOpsFocus(prisma, new Date(currentWeekStartUtc(now))),
  ]);

  const doneThisWeek = tasks
    .filter((t) => t.status === 'done' && now.getTime() - t.updatedAt.getTime() <= DONE_WINDOW_MS)
    .map((t) => t.title);
  const focusItems = focusRow ? parseFocusItems(focusRow.items) : null;

  const digest = buildOpsDigest({
    tasks: tasks.map(serializeOpsTask),
    contacts: contacts.map(serializeOpsContact),
    doneThisWeek,
    focusItems,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    now,
  });

  // Email fan-out and the Slack post are independent I/O — run them together.
  const recipients = members().map((m) => m.email);
  const [emailResults, slackOk] = await Promise.all([
    Promise.all(
      recipients.map((to) =>
        sendEmail({ to, subject: digest.subject, text: digest.text, html: digest.html })
          .then(() => ({ to, ok: true as const }))
          .catch((err) => ({ to, ok: false as const, error: err instanceof Error ? err.message : String(err) })),
      ),
    ),
    postToSlack(digest.text),
  ]);

  const sent = emailResults.filter((r) => r.ok).map((r) => r.to);
  const failed = emailResults.filter((r) => !r.ok);
  const anySuccess = sent.length > 0 || slackOk;

  await writeOpsAudit(prisma, {
    actor: 'cron:ops-digest',
    action: anySuccess ? 'digest.sent' : 'digest.failed',
    detail: { sent, failed, slack: slackOk, subject: digest.subject },
  });

  return NextResponse.json({ ok: anySuccess, sent, failed: failed.length, slack: slackOk });
}
