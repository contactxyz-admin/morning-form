/**
 * Friday ops digest — the weekly review email/Slack message, built purely
 * from serialized board state so it's testable without a DB. The content
 * mirrors the Briefing tab: where the pilot clock stands, what moved this
 * week, what's at risk, and which contacts are waiting on us.
 */
import type { OpsTaskDto } from '@/app/ops/board-client';
import type { OpsContactDto } from '@/app/ops/contacts-client';
import {
  buildBriefing,
  contactBucket,
  daysBetweenUtc,
  shortDayMonth,
  STALE_CONTACT_DAYS,
} from '@/app/ops/intelligence';
import { escapeHtml } from '@/lib/ops/html';

export interface OpsDigest {
  subject: string;
  text: string;
  html: string;
}

export interface BuildOpsDigestInput {
  tasks: OpsTaskDto[];
  contacts: OpsContactDto[];
  /**
   * Titles of tasks marked done in the review window — computed by the
   * caller from updatedAt (the DTO doesn't carry it, and there is no
   * dedicated doneAt column, so this is an honest approximation).
   */
  doneThisWeek: string[];
  /** This week's 3 if set (CompanyOpsFocus), else null. */
  focusItems: string[] | null;
  appUrl: string;
  now: Date;
}

const REASON_LABEL = { overdue: 'OVERDUE', blocked: 'BLOCKED', due_soon: 'due soon' } as const;
const DONE_LIST_CAP = 6;
const CONTACT_LIST_CAP = 5;

export function buildOpsDigest(input: BuildOpsDigestInput): OpsDigest {
  const { tasks, contacts, doneThisWeek, focusItems, now, appUrl } = input;
  const briefing = buildBriefing(tasks, now);

  const clock =
    briefing.week.state === 'active'
      ? `W${briefing.week.week} of ${briefing.weekCount}`
      : briefing.week.state === 'before'
        ? 'Pre-kickoff'
        : 'Window complete';
  const countdown = briefing.daysToPilotLive > 0 ? `${briefing.daysToPilotLive} days to Pilot LIVE (17 Aug)` : null;
  const milestone = briefing.nextMilestone
    ? `Next milestone: ${briefing.nextMilestone.label} (W${briefing.nextMilestone.week})`
    : null;

  const attentionLines = briefing.attention.map(({ task, reason }) => {
    const due = reason !== 'blocked' ? (shortDayMonth(task.dueDate) ?? '') : '';
    const owner = task.ownerEmail ?? 'unassigned';
    return `[${REASON_LABEL[reason]}${due ? ` ${due}` : ''}] ${task.title} — ${owner}`;
  });

  const actNow = contacts.filter((c) => contactBucket(c.status) === 'act_now');
  const stale = contacts.filter((c) => {
    const b = contactBucket(c.status);
    return (b === 'act_now' || b === 'waiting') && daysBetweenUtc(c.updatedAt, now) >= STALE_CONTACT_DAYS;
  });
  const contactLines = actNow
    .slice(0, CONTACT_LIST_CAP)
    .map((c) => `${c.org} (${c.status}) — ${c.nextStep || 'no next step set'}`);
  const contactOverflow = actNow.length - contactLines.length;
  const doneShown = doneThisWeek.slice(0, DONE_LIST_CAP);
  const doneOverflow = doneThisWeek.length - doneShown.length;

  const headerBits = [clock, countdown, milestone].filter(Boolean).join(' · ');
  const trackerLine = `${briefing.statusCounts.done}/${briefing.total} tasks done · ${briefing.overdueCount} overdue · ${briefing.statusCounts.blocked} blocked`;

  const subject = `Ops digest — ${clock}: ${briefing.statusCounts.done}/${briefing.total} done · ${briefing.overdueCount} overdue · ${actNow.length} contacts need action`;

  const text = [
    `MorningForm weekly ops digest`,
    headerBits,
    '',
    `TRACKER — ${trackerLine}`,
    ...(doneShown.length
      ? ['', 'MARKED DONE THIS WEEK', ...doneShown.map((t) => `- ${t}`), ...(doneOverflow > 0 ? [`(+${doneOverflow} more)`] : [])]
      : []),
    ...(attentionLines.length
      ? ['', 'NEEDS ATTENTION', ...attentionLines.map((l) => `- ${l}`)]
      : ['', 'Nothing overdue, blocked, or due in the next 7 days.']),
    ...(briefing.attentionOverflow > 0 ? [`(+${briefing.attentionOverflow} more on the board)`] : []),
    '',
    contacts.length === 0
      ? 'CONTACTS — pipeline not seeded yet. Import the plan list from the Contacts tab so outreach shows up here.'
      : `CONTACTS — ${actNow.length} need action${
          stale.length ? ` · ${stale.length} in play untouched ${STALE_CONTACT_DAYS}+ days` : ''
        }`,
    ...contactLines.map((l) => `- ${l}`),
    ...(contactOverflow > 0 ? [`(+${contactOverflow} more need action)`] : []),
    ...(focusItems && focusItems.length ? ['', "THIS WEEK'S 3", ...focusItems.map((f, i) => `${i + 1}. ${f}`)] : []),
    '',
    `Friday review: update statuses, log any decisions, honest gut-check against the target date.`,
    `Open the board: ${appUrl.replace(/\/$/, '')}/ops`,
  ].join('\n');

  const html = `<p><strong>MorningForm weekly ops digest</strong><br>${escapeHtml(headerBits)}</p>
<p><strong>Tracker</strong> — ${escapeHtml(trackerLine)}</p>
${
  doneShown.length
    ? `<p><strong>Marked done this week</strong></p><ul>${doneShown.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>${
        doneOverflow > 0 ? `<p>+${doneOverflow} more</p>` : ''
      }`
    : ''
}
${
  attentionLines.length
    ? `<p><strong>Needs attention</strong></p><ul>${attentionLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>${
        briefing.attentionOverflow > 0 ? `<p>+${briefing.attentionOverflow} more on the board</p>` : ''
      }`
    : '<p>Nothing overdue, blocked, or due in the next 7 days.</p>'
}
${
  contacts.length === 0
    ? '<p><strong>Contacts</strong> — pipeline not seeded yet. Import the plan list from the Contacts tab so outreach shows up here.</p>'
    : `<p><strong>Contacts</strong> — ${actNow.length} need action${
        stale.length ? ` · ${stale.length} in play untouched ${STALE_CONTACT_DAYS}+ days` : ''
      }</p>`
}
${contactLines.length ? `<ul>${contactLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : ''}
${contactOverflow > 0 ? `<p>+${contactOverflow} more need action</p>` : ''}
${
  focusItems && focusItems.length
    ? `<p><strong>This week's 3</strong></p><ol>${focusItems.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ol>`
    : ''
}
<p>Friday review: update statuses, log any decisions, honest gut-check against the target date.</p>
<p><a href="${escapeHtml(appUrl.replace(/\/$/, ''))}/ops">Open the board</a></p>`;

  return { subject, text, html };
}
