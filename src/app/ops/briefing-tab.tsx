/**
 * Briefing — the /ops landing tab. Everything here is computed on the server
 * from the live CompanyOpsTask rows plus the static pilot plan (see
 * intelligence.ts): it answers "where are we, what's at risk, what do I do
 * today?" before the founder opens the tracker itself.
 */
import Link from 'next/link';
import styles from './ops.module.css';
import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';
import type { OpsMemberDto, OpsTaskDto } from './board-client';
import { buildBriefing, rhythmIndexForDate, type AttentionItem, type BriefingModel } from './intelligence';

const REASON_LABEL: Record<AttentionItem['reason'], string> = {
  overdue: 'Overdue',
  blocked: 'Blocked',
  due_soon: 'Due soon',
};

const REASON_PILL: Record<AttentionItem['reason'], string> = {
  overdue: styles.pillRed,
  blocked: styles.pillRed,
  due_soon: styles.pillPeach,
};

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function BriefingTab({
  tasks,
  members,
  now,
}: {
  tasks: OpsTaskDto[];
  members: OpsMemberDto[];
  now: Date;
}) {
  const briefing = buildBriefing(tasks, now);
  const nameFor = (email: string | null) =>
    email === null
      ? 'Unassigned'
      : (members.find((m) => m.email.toLowerCase() === email.toLowerCase())?.name ?? email);

  return (
    <>
      <h2 className={styles.h2}>Briefing</h2>
      <p className={styles.sub}>
        Live picture from the shared tracker and the pilot plan — recomputed on every load. Edits happen in{' '}
        <Link href="/ops?tab=work">Workstream</Link>.
      </p>

      <StatTiles briefing={briefing} />
      <MilestoneStrip briefing={briefing} />

      <div className={styles.card}>
        <p className={styles.kick}>Needs attention</p>
        <AttentionList briefing={briefing} nameFor={nameFor} />
      </div>

      <div className={styles.twoCol}>
        <div>
          <div className={styles.card}>
            <p className={styles.kick}>Progress by phase</p>
            {briefing.phaseProgress.length === 0 ? (
              <p className={styles.note}>No tasks on the board yet — seed them in the Workstream tab.</p>
            ) : (
              briefing.phaseProgress.map(({ phase, done, total }) => (
                <div key={phase || 'unphased'} className={styles.progressRow}>
                  <span className={styles.progressLabel} title={phase || 'Unphased'}>
                    {phase || 'Unphased'}
                  </span>
                  <span className={styles.progressTrack} aria-hidden="true">
                    <span className={styles.progressFill} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                  </span>
                  <span className={styles.progressCount}>
                    {done}/{total}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className={styles.card}>
            <p className={styles.kick}>Load by owner</p>
            <div className={styles.ownerChips}>
              {briefing.ownerLoad.length === 0 && <span className={styles.note}>Nothing assigned yet.</span>}
              {briefing.ownerLoad.map(({ ownerEmail, open, done }) => (
                <span
                  key={ownerEmail ?? 'unassigned'}
                  className={`${styles.ownerChip} ${ownerEmail === null && open > 0 ? styles.ownerChipWarn : ''}`}
                >
                  <b>{nameFor(ownerEmail)}</b> · {open} open{done > 0 ? ` · ${done} done` : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className={styles.card}>
            <p className={styles.kick}>This week&rsquo;s 3</p>
            <ol className={styles.list}>
              {PILOT_PLAN.week3.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ol>
          </div>
          <TodayRhythmCard now={now} />
        </div>
      </div>
    </>
  );
}

function StatTiles({ briefing }: { briefing: BriefingModel }) {
  const { week, weekCount, daysToPilotLive, nextMilestone, statusCounts, total, overdueCount } = briefing;
  const weekTile =
    week.state === 'active'
      ? { num: `W${week.week} of ${weekCount}`, sub: `week starting ${week.label}` }
      : week.state === 'before'
        ? { num: 'Pre-kickoff', sub: `W1 starts ${PILOT_PLAN.weeks[0].label}` }
        : { num: 'Wrapped', sub: '12-week window complete' };

  const liveTile =
    daysToPilotLive > 0
      ? { num: `${daysToPilotLive} days`, sub: 'to Pilot LIVE · W9 · 17 Aug' }
      : { num: 'LIVE', sub: 'pilot window is open' };

  const milestoneTile = nextMilestone
    ? {
        num: nextMilestone.label,
        sub:
          nextMilestone.daysUntilWeekStart <= 0
            ? `W${nextMilestone.week} — this week`
            : `W${nextMilestone.week} — in ${nextMilestone.daysUntilWeekStart} days`,
      }
    : { num: 'None left', sub: 'all milestone weeks have passed' };

  const openCount = total - statusCounts.done;
  const alerts = [
    overdueCount > 0 ? `${overdueCount} overdue` : null,
    statusCounts.blocked > 0 ? `${statusCounts.blocked} blocked` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={styles.statRow}>
      <Tile label="Pilot clock" num={weekTile.num} sub={weekTile.sub} />
      <Tile label="Countdown" num={liveTile.num} sub={liveTile.sub} />
      <Tile label="Next milestone" num={milestoneTile.num} sub={milestoneTile.sub} />
      <Tile
        label="Tracker"
        num={`${statusCounts.done}/${total} done`}
        sub={alerts || `${openCount} open · nothing overdue or blocked`}
        alert={overdueCount > 0 || statusCounts.blocked > 0}
      />
    </div>
  );
}

function Tile({ label, num, sub, alert }: { label: string; num: string; sub: string; alert?: boolean }) {
  return (
    <div className={styles.stat}>
      <p className={styles.kick}>{label}</p>
      <div className={`${styles.statNum} ${alert ? styles.statNumAlert : ''}`}>{num}</div>
      <div className={styles.statSub}>{sub}</div>
    </div>
  );
}

function MilestoneStrip({ briefing }: { briefing: BriefingModel }) {
  const activeWeek = briefing.week.state === 'active' ? briefing.week.week : null;
  const afterWindow = briefing.week.state === 'after';
  return (
    <div className={styles.mileStrip}>
      {Object.entries(PILOT_PLAN.milestones).map(([weekStr, label]) => {
        const week = Number(weekStr);
        const done = afterWindow || (activeWeek !== null && week < activeWeek);
        const current = activeWeek === week;
        return (
          <span key={weekStr} className={`${styles.mile} ${done ? styles.mileDone : ''} ${current ? styles.mileNow : ''}`}>
            <span className={styles.mileWeek}>{done ? '✓' : `W${week}`}</span>
            {label}
          </span>
        );
      })}
    </div>
  );
}

function AttentionList({
  briefing,
  nameFor,
}: {
  briefing: BriefingModel;
  nameFor: (email: string | null) => string;
}) {
  if (briefing.total === 0) {
    return <p className={styles.note}>The tracker is empty — nothing to watch yet.</p>;
  }
  if (briefing.attention.length === 0) {
    return (
      <p className={styles.attEmpty}>
        Nothing overdue, blocked, or due in the next 7 days. Clear runway — work the critical path.
      </p>
    );
  }
  return (
    <>
      {briefing.attention.map(({ task, reason }) => {
        const due = shortDate(task.dueDate);
        return (
          <div key={task.id} className={styles.attRow}>
            <span className={`${styles.pill} ${REASON_PILL[reason]}`}>
              {REASON_LABEL[reason]}
              {reason !== 'blocked' && due ? ` · ${due}` : ''}
            </span>
            <span className={styles.attTitle}>{task.title}</span>
            <span className={styles.attMeta}>
              {task.phase || 'Unphased'} · {nameFor(task.ownerEmail)}
            </span>
          </div>
        );
      })}
      {briefing.attentionOverflow > 0 && (
        <p className={styles.attMore}>
          +{briefing.attentionOverflow} more — <Link href="/ops?tab=work">open Workstream</Link>.
        </p>
      )}
    </>
  );
}

function TodayRhythmCard({ now }: { now: Date }) {
  const todayIndex = rhythmIndexForDate(now);
  return (
    <div className={styles.card}>
      <p className={styles.kick}>Operating rhythm</p>
      {PILOT_PLAN.rhythm.map(([when, what], i) => (
        <div key={when} className={`${styles.rhythmRow} ${i === todayIndex ? styles.rhythmToday : ''}`}>
          <b>{when}</b>
          {i === todayIndex && <span className={styles.todayPill}>Today</span>} —{' '}
          <span className={styles.note}>{what}</span>
        </div>
      ))}
    </div>
  );
}
