/**
 * Reference tabs ported from the pilot-ops planning gist — see
 * src/lib/ops/pilot-plan-data.ts for the content. The underlying plan data
 * stays static/read-only, but the tabs themselves are now interactive where
 * that earns its keep: the scorecard is a what-if sandbox, the funnel works
 * the conversion math backwards from the draw goal, contacts/decisions get
 * pipeline filters, and the KPI/timeline/rhythm views are aware of today's
 * date. If a section needs to become live/collaborative (edits that persist),
 * promote it to a real table the way the Workstream tab already works.
 */
import { Fragment } from 'react';
import styles from './ops.module.css';
import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';
import {
  buildTimelineModel,
  milestoneLabelsForWeeks,
  timelineWindowCopy,
  type TimelineColorKey,
} from './timeline-helpers';
import { buildWindowState, kpiWeekFlag, rhythmIndexForDate, type KpiWeekFlag } from './intelligence';
import { ScorecardClient } from './scorecard-client';
import { FunnelClient } from './funnel-client';
import { ContactsClient } from './contacts-client';
import { DecisionsClient } from './decisions-client';

const BAR_CLASS: Record<TimelineColorKey, string> = {
  coral: styles.barCoral,
  gym: styles.barPurple,
  tech: styles.barBlue,
  sage: styles.barSage,
  gold: styles.barGold,
};

export function StartHereTab() {
  const todayRhythmIndex = rhythmIndexForDate(new Date());
  return (
    <>
      <h2 className={styles.h2}>Start Here</h2>
      <p className={styles.sub}>Solo operating system. This is a focus rhythm, not a coordination tool.</p>
      <div className={styles.card}>
        <p className={styles.kick}>The Goal</p>
        <div>{PILOT_PLAN.goal}</div>
      </div>
      <div className={styles.card}>
        <p className={styles.kick}>North Star</p>
        <div className={styles.big}>{PILOT_PLAN.northstar}</div>
      </div>
      <div className={styles.card}>
        <p className={styles.kick}>This Week&rsquo;s 3</p>
        <ol className={styles.list}>
          {PILOT_PLAN.week3.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ol>
      </div>
      <div className={styles.card}>
        <p className={styles.kick}>Operating Rhythm</p>
        {PILOT_PLAN.rhythm.map(([when, what], i) => (
          <div key={when} className={`${styles.rhythmRow} ${i === todayRhythmIndex ? styles.rhythmToday : ''}`}>
            <b>{when}</b>
            {i === todayRhythmIndex && <span className={styles.todayPill}>Today</span>} —{' '}
            <span className={styles.note}>{what}</span>
          </div>
        ))}
      </div>
      <div className={styles.card}>
        <p className={styles.kick}>Rules of the Road</p>
        <ol className={styles.list}>
          {PILOT_PLAN.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </div>
    </>
  );
}

function KpiWeekChip({ flag }: { flag: KpiWeekFlag }) {
  if (flag.state === 'passed') {
    return <span className={`${styles.pill} ${styles.pillRed}`}>was due W{flag.week} — check</span>;
  }
  if (flag.state === 'this_week') {
    return <span className={`${styles.pill} ${styles.pillPeach}`}>due this week (W{flag.week})</span>;
  }
  return <span className={`${styles.pill} ${styles.pillGrey}`}>due W{flag.week}</span>;
}

export function KpisTab() {
  const now = new Date();
  return (
    <>
      <h2 className={styles.h2}>Objectives &amp; KPIs</h2>
      <p className={styles.sub}>
        Targets from the original plan, flagged against today&rsquo;s pilot week. Update actuals in the Workstream
        tracker.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Objective / key result</th>
            <th className={styles.th}>Target</th>
            <th className={styles.th}>When</th>
            <th className={styles.th}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {PILOT_PLAN.kpis.map(([name, target, note], i) => {
            const flag = kpiWeekFlag(target, now);
            return (
              <tr key={name} className={i % 2 === 1 ? styles.trEven : undefined}>
                <td className={styles.td}>{name}</td>
                <td className={styles.td}>{target}</td>
                <td className={styles.td}>{flag ? <KpiWeekChip flag={flag} /> : <span className={styles.note}>—</span>}</td>
                <td className={`${styles.td} ${styles.note}`}>{note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export function TimelineTab() {
  const timeline = buildTimelineModel();
  const activeWeek = timeline.currentWeek.state === 'active' ? timeline.currentWeek.week : null;
  const afterWindow = timeline.currentWeek.state === 'after';
  const weekPassed = (w: number) => afterWindow || (activeWeek !== null && w < activeWeek);
  const milestoneEntries = timeline.weeks.flatMap((week) => {
    const label = timeline.milestonesByWeek[week.w];
    return label ? [{ week, label }] : [];
  });

  return (
    <>
      <h2 className={styles.h2}>Timeline</h2>
      <p className={styles.sub}>12-week roadmap from Mon 22 Jun 2026. {timelineWindowCopy(timeline.currentWeek)}</p>
      <div className={styles.timelineWrap}>
        <div className={styles.grid} aria-hidden="true">
          <div className={styles.glabel}>Workstream</div>
          {timeline.weeks.map((w) => (
            <div key={w.w} className={`${styles.gwk} ${activeWeek === w.w ? styles.currentWeek : ''}`}>
              <span>W{w.w}</span>
              <br />
              {w.label}
            </div>
          ))}
          {timeline.rows.map((row) => (
            <Fragment key={row.label}>
              <div className={styles.glabel}>
                <span className={styles.timelineLabel}>{row.label}</span>
                <span className={styles.timelineMeta}>
                  {row.lane} · W{row.from}-W{row.to}
                </span>
                {row.isCritical && <span className={styles.criticalPill}>Critical</span>}
              </div>
              {timeline.weeks.map((week) => (
                <div
                  key={`${row.label}-${week.w}`}
                  className={`${styles.gcell} ${activeWeek === week.w ? styles.currentWeekCell : ''} ${
                    week.w >= row.from && week.w <= row.to ? BAR_CLASS[row.colorClassKey] : styles.gcellEmpty
                  }`}
                />
              ))}
            </Fragment>
          ))}
          <div className={styles.glabel}>Milestones</div>
          {timeline.weeks.map((week) => (
            <div
              key={`mile-${week.w}`}
              className={`${styles.gcell} ${styles.gcellMile} ${activeWeek === week.w ? styles.currentWeekCell : ''}`}
            >
              {timeline.milestonesByWeek[week.w] && (
                <span>
                  {weekPassed(week.w) && <span className={styles.mileTick}>✓ </span>}
                  W{week.w} {timeline.milestonesByWeek[week.w]}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className={styles.mobileTimeline}>
          {timeline.rows.map((row) => {
            const rowMilestones = milestoneLabelsForWeeks(row.weeks, timeline.milestonesByWeek);

            return (
              <article key={row.label} className={styles.mobileTimelineRow}>
                <div>
                  <span className={styles.timelineMeta}>{row.lane}</span>
                  <h3 className={styles.mobileTimelineTitle}>{row.label}</h3>
                </div>
                <div className={styles.mobileTimelineFacts}>
                  <span>
                    W{row.from}-W{row.to} · {row.startLabel} to {row.endLabel}
                  </span>
                  {row.isCritical && <span className={styles.criticalPill}>Critical</span>}
                  {activeWeek && row.weeks.includes(activeWeek) && <span className={styles.activePill}>Active now</span>}
                </div>
                {rowMilestones.length > 0 && (
                  <p className={styles.mobileTimelineMilestones}>Milestones: {rowMilestones.join(', ')}</p>
                )}
              </article>
            );
          })}
          <div className={styles.mobileTimelineMilestoneList}>
            <p className={styles.kick}>Milestones</p>
            {milestoneEntries.map(({ week, label }) => (
              <div key={week.w}>
                {weekPassed(week.w) && <span className={styles.mileTick}>✓ </span>}
                <b>W{week.w}</b> · {label}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.srOnly}>
          <h3>Pilot timeline workstreams and milestones</h3>
          <ul>
            {timeline.rows.map((row) => {
              const rowMilestones = milestoneLabelsForWeeks(row.weeks, timeline.milestonesByWeek);

              return (
                <li key={row.label}>
                  {row.label}. Lane: {row.lane}. Weeks {row.from} through {row.to}, {row.startLabel} to {row.endLabel}.
                  {row.isCritical ? ' Critical path.' : ' Not critical path.'} Milestones:{' '}
                  {rowMilestones.length > 0 ? rowMilestones.join(', ') : 'none'}.
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}

export function ProductTechTab() {
  const now = new Date();
  return (
    <>
      <h2 className={styles.h2}>Product &amp; Tech</h2>
      <p className={styles.sub}>
        What the MVP is, the stack, and when build/design must start — the current build window is flagged against
        today&rsquo;s pilot week. Built ON the live MorningForm product — extend, don&rsquo;t rebuild.
      </p>
      <div className={styles.card}>
        <p className={styles.kick}>Pilot MVP — in scope</p>
        <ul className={styles.list}>
          {PILOT_PLAN.mvp_in.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      <div className={styles.card}>
        <p className={`${styles.kick} ${styles.dim}`}>Out of scope for pilot — defer</p>
        <ul className={`${styles.list} ${styles.dim}`}>
          {PILOT_PLAN.mvp_out.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      <div className={styles.card}>
        <p className={styles.kick}>Tech stack &amp; architecture</p>
        <div>
          <b>Reuse (live today):</b> {PILOT_PLAN.stack.have.join('  ·  ')}
        </div>
        <div style={{ marginTop: 6 }}>
          <b style={{ color: 'var(--coral)' }}>Build for the pilot:</b> {PILOT_PLAN.stack.build.join('  ·  ')}
        </div>
      </div>
      <div className={styles.card}>
        <p className={styles.kick}>Build &amp; design timeline</p>
        <table>
          <tbody>
            {PILOT_PLAN.buildplan.map(([when, what]) => {
              const state = buildWindowState(when, now);
              return (
                <tr key={when} className={state === 'passed' ? styles.dim : undefined}>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top', paddingRight: 10 }}>
                    {state === 'passed' && <span className={styles.mileTick}>✓ </span>}
                    {when}
                    {state === 'now' && <span className={styles.todayPill}>Now</span>}
                  </td>
                  <td className={state === 'now' ? styles.buildNowCell : undefined}>{what}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.card}>
        <p className={styles.kick}>CPTO critical-path calls</p>
        <ol className={styles.list}>
          {PILOT_PLAN.cpto.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      </div>
    </>
  );
}

export function ScorecardTab() {
  return (
    <>
      <h2 className={styles.h2}>Partner Scorecard</h2>
      <p className={styles.sub}>
        Starting hypotheses from the original plan (1–5 per criterion, weighted) — now a live sandbox: poke the
        scores as diligence answers land and watch the ranking move.
      </p>
      <ScorecardClient />
      <div className={styles.card} style={{ marginTop: 14 }}>
        <p className={styles.kick}>Diligence questions — ask every partner</p>
        <ol className={styles.list}>
          {PILOT_PLAN.diligence.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
      </div>
    </>
  );
}

export function FunnelTab() {
  return (
    <>
      <h2 className={styles.h2}>Pilot Funnel</h2>
      <p className={styles.sub}>
        The funnel this pilot needs to prove out — worked backwards from the draw goal at target conversion rates.
      </p>
      <FunnelClient />
    </>
  );
}

export function DecisionsTab() {
  return (
    <>
      <h2 className={styles.h2}>Decision Log</h2>
      <p className={styles.sub}>Log the call the day you make it.</p>
      <DecisionsClient />
    </>
  );
}

export function RiskTab() {
  return (
    <>
      <h2 className={styles.h2}>Risk &amp; Compliance</h2>
      <p className={styles.sub}>Partner carries most of it — verify, don&rsquo;t assume.</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Compliance item</th>
            <th className={styles.th}>Owner</th>
            <th className={styles.th}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {PILOT_PLAN.risk.map(([item, owner, notes], i) => (
            <tr key={item} className={i % 2 === 1 ? styles.trEven : undefined}>
              <td className={styles.td}>{item}</td>
              <td className={styles.td}>{owner}</td>
              <td className={`${styles.td} ${styles.note}`}>{notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.kick} style={{ marginTop: 18 }}>
        Risk register
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Risk</th>
            <th className={styles.th}>Likelihood</th>
            <th className={styles.th}>Impact</th>
            <th className={styles.th}>Mitigation</th>
          </tr>
        </thead>
        <tbody>
          {PILOT_PLAN.riskreg.map(([risk, likelihood, impact, mitigation], i) => (
            <tr key={risk} className={i % 2 === 1 ? styles.trEven : undefined}>
              <td className={styles.td}>{risk}</td>
              <td className={styles.td}>{likelihood}</td>
              <td className={styles.td}>{impact}</td>
              <td className={`${styles.td} ${styles.note}`}>{mitigation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function ContactsTab() {
  return (
    <>
      <h2 className={styles.h2}>Contacts &amp; Outreach</h2>
      <p className={styles.sub}>
        Who&rsquo;s contacted, what&rsquo;s next — bucketed by what each one demands of us today.
      </p>
      <ContactsClient />
    </>
  );
}

export const REFERENCE_TABS = [
  { key: 'start', label: 'Start Here', Component: StartHereTab },
  { key: 'kpis', label: 'Objectives & KPIs', Component: KpisTab },
  { key: 'timeline', label: 'Timeline', Component: TimelineTab },
  { key: 'product', label: 'Product & Tech', Component: ProductTechTab },
  { key: 'scorecard', label: 'Scorecard', Component: ScorecardTab },
  { key: 'funnel', label: 'Pilot Funnel', Component: FunnelTab },
  { key: 'decisions', label: 'Decisions', Component: DecisionsTab },
  { key: 'risk', label: 'Risk & Compliance', Component: RiskTab },
  { key: 'contacts', label: 'Contacts', Component: ContactsTab },
] as const;

export type ReferenceTabKey = (typeof REFERENCE_TABS)[number]['key'];
