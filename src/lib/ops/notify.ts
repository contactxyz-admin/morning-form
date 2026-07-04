/**
 * Delegation notify — the "assignee gets pinged" half of the ops board.
 *
 * Called only when a task's ownerEmail actually changes to a non-null value
 * (the caller — the PATCH route or the assign_ops_task MCP tool, both via
 * `src/lib/ops/assign.ts` — is responsible for that idempotency check; this
 * function always sends when called). Email always attempted; Slack only if
 * a webhook is configured. Neither channel failing throws — this function
 * always resolves, and the outcome (sent / failed, which channels) lands in
 * one CompanyOpsAudit row.
 */
import type { CompanyOpsTask } from '@prisma/client';
import type { PrismaClient, Prisma } from '@prisma/client';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/auth/email';
import { memberByEmail } from '@/lib/ops/config';
import { writeOpsAudit } from '@/lib/ops/audit';

type Db = PrismaClient | Prisma.TransactionClient;

export interface NotifyDelegationInput {
  task: CompanyOpsTask;
  newOwnerEmail: string;
  actorEmail: string;
}

function formatDueDate(dueDate: Date | null): string {
  if (!dueDate) return 'No due date set';
  return dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildMessage(task: CompanyOpsTask, actorEmail: string): { text: string; html: string } {
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const opsUrl = `${appUrl}/ops`;
  const lines = [
    `${actorEmail} assigned you a task on the MorningForm ops board:`,
    '',
    `"${task.title}"`,
    task.phase ? `Phase: ${task.phase}` : null,
    task.detail ? `Detail: ${task.detail}` : null,
    `Due: ${formatDueDate(task.dueDate)}`,
    '',
    `View it: ${opsUrl}`,
  ].filter((l): l is string => l !== null);

  const text = lines.join('\n');
  const html = `<p>${actorEmail} assigned you a task on the MorningForm ops board:</p>
<p><strong>${escapeHtml(task.title)}</strong></p>
${task.phase ? `<p>Phase: ${escapeHtml(task.phase)}</p>` : ''}
${task.detail ? `<p>Detail: ${escapeHtml(task.detail)}</p>` : ''}
<p>Due: ${escapeHtml(formatDueDate(task.dueDate))}</p>
<p><a href="${opsUrl}">View it on the ops board</a></p>`;

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function postToSlack(text: string, slackId: string | undefined): Promise<boolean> {
  if (!env.COMPANY_OPS_SLACK_WEBHOOK) return false;
  try {
    const mention = slackId ? `<@${slackId}> ` : '';
    const res = await fetch(env.COMPANY_OPS_SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `${mention}${text}` }),
    });
    return res.ok;
  } catch (err) {
    console.error('[ops] slack notify failed', { err: err instanceof Error ? err.message : err });
    return false;
  }
}

export async function notifyDelegation(db: Db, input: NotifyDelegationInput): Promise<void> {
  const { task, newOwnerEmail, actorEmail } = input;
  const member = memberByEmail(newOwnerEmail);
  const { text, html } = buildMessage(task, actorEmail);

  // Email and Slack are independent I/O with no data dependency between
  // them — run concurrently rather than paying both latencies in serial.
  const [emailResult, slackOk] = await Promise.all([
    sendEmail({
      to: newOwnerEmail,
      subject: `MorningForm: you have been assigned "${task.title}"`,
      text,
      html,
    })
      .then((result) => ({ ok: true as const, sent: result.sent }))
      .catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) })),
    postToSlack(text, member?.slackId),
  ]);

  const channels: string[] = [];
  let emailError: string | undefined;
  if (emailResult.ok) {
    // `sent: false` in dev/test (no RESEND_API_KEY) is expected, logged
    // behaviour, not a failure — still counts as the email channel firing.
    channels.push(emailResult.sent ? 'email' : 'email (dev-logged)');
  } else {
    emailError = emailResult.error;
  }
  if (slackOk) channels.push('slack');

  await writeOpsAudit(db, {
    actor: actorEmail,
    action: emailResult.ok || slackOk ? 'notify.sent' : 'notify.failed',
    taskId: task.id,
    detail: { newOwnerEmail, channels, emailError },
  });
}
