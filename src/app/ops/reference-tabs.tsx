/**
 * Read-only reference tabs ported from the pilot-ops planning gist — see
 * src/lib/ops/pilot-plan-data.ts for the content and why this is static
 * rather than a live/editable surface.
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

const BAR_CLASS: Record<TimelineColorKey, string> = {
  coral: styles.barCoral,
  gym: styles.barPurple,
  tech: styles.barBlue,
  sage: styles.barSage,
  gold: styles.barGold,
};

// Buckets the varied free-text status vocabulary across the reference tabs
// (decision log, contacts/outreach) into the same 4-tone system the live
// Workstream tab already uses, so "status" reads consistently everywhere.
const PILL_TONE: Record<string, string> = {
  Done: styles.pillGreen,
  Decided: styles.pillGreen,
  Verified: styles.pillGreen,
  Connected: styles.pillGreen,
  Confirmed: styles.pillGreen,
  Replied: styles.pillGreen,
  Open: styles.pillPeach,
  'In progress': styles.pillPeach,
  Sent: styles.pillPeach,
  'Draft sent': styles.pillPeach,
  'Draft ready': styles.pillPeach,
  'Call booked': styles.pillPeach,
  Blocked: styles.pillRed,
  Bounced: styles.pillRed,
  Declined: styles.pillRed,
  'Not started': styles.pillGrey,
  Parked: styles.pillGrey,
  Deferred: styles.pillGrey,
};

function StatusPill({ value }: { value: string }) {
  return <span className={`${styles.pill} ${PILL_TONE[value] ?? styles.pillGrey}`}>{value}</span>;
}

export function StartHereTab() {
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
        {PILOT_PLAN.rhythm.map(([when, what]) => (
          <div key={when} className={styles.rhythmRow}>
            <b>{when}</b> — <span className={styles.note}>{what}</span>
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

export function KpisTab() {
  return (
    <>
      <h2 className={styles.h2}>Objectives &amp; KPIs</h2>
      <p className={styles.sub}>Targets from the original plan. Update actuals in the Workstream tracker.</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Objective / key result</th>
            <th className={styles.th}>Target</th>
            <th className={styles.th}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {PILOT_PLAN.kpis.map(([name, target, note], i) => (
            <tr key={name} className={i % 2 === 1 ? styles.trEven : undefined}>
              <td className={styles.td}>{name}</td>
              <td className={styles.td}>{target}</td>
              <td className={`${styles.td} ${styles.note}`}>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function TimelineTab() {
  const timeline = buildTimelineModel();
  const activeWeek = timeline.currentWeek.state === 'active' ? timeline.currentWeek.week : null;
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
  return (
    <>
      <h2 className={styles.h2}>Product &amp; Tech</h2>
      <p className={styles.sub}>
        What the MVP is, the stack, and when build/design must start. Built ON the live MorningForm product — extend,
        don&rsquo;t rebuild.
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
            {PILOT_PLAN.buildplan.map(([when, what]) => (
              <tr key={when}>
                <td style={{ fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top', paddingRight: 10 }}>
                  {when}
                </td>
                <td>{what}</td>
              </tr>
            ))}
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
  const wsum = PILOT_PLAN.criteria.reduce((a, c) => a + c[1], 0);
  const totals = PILOT_PLAN.partners.map((_, pi) => {
    const s = PILOT_PLAN.criteria.reduce((acc, c) => acc + c[2][pi] * c[1], 0);
    return s / wsum;
  });
  const ranks = totals.map((x) => 1 + totals.filter((y) => y > x).length);
  return (
    <>
      <h2 className={styles.h2}>Partner Scorecard</h2>
      <p className={styles.sub}>Starting hypotheses from the original plan (1–5 per criterion, weighted).</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Criterion</th>
            <th className={styles.th}>Wt %</th>
            {PILOT_PLAN.partners.map((p) => (
              <th className={styles.th} key={p}>
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PILOT_PLAN.criteria.map(([name, weight, scores], i) => (
            <tr key={name} className={i % 2 === 1 ? styles.trEven : undefined}>
              <td className={styles.td}>{name}</td>
              <td className={styles.td}>{weight}</td>
              {scores.map((s, pi) => (
                <td className={styles.td} key={pi}>
                  {s}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className={`${styles.td} ${styles.tot}`}>Weighted (1–5)</td>
            <td className={styles.td} />
            {totals.map((t, pi) => (
              <td className={`${styles.td} ${styles.tot}`} key={pi}>
                {t.toFixed(2)}
              </td>
            ))}
          </tr>
          <tr>
            <td className={`${styles.td} ${styles.tot}`}>Rank</td>
            <td className={styles.td} />
            {ranks.map((r, pi) => (
              <td className={`${styles.td} ${styles.tot}`} key={pi}>
                #{r}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
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
      <p className={styles.sub}>The funnel this pilot needs to prove out, in order.</p>
      <div className={styles.card}>
        <div className={styles.funnelFlow}>
          {PILOT_PLAN.funnel.map((stage, i) => (
            <div className={styles.funnelStep} key={stage}>
              <span className={styles.funnelIndex}>{i + 1}</span>
              <span>{stage}</span>
              {i < PILOT_PLAN.funnel.length - 1 && (
                <span className={styles.funnelArrow} aria-hidden="true">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function DecisionsTab() {
  return (
    <>
      <h2 className={styles.h2}>Decision Log</h2>
      <p className={styles.sub}>Log the call the day you make it.</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Decision</th>
            <th className={styles.th}>Options</th>
            <th className={styles.th}>Decision / rationale</th>
            <th className={styles.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {PILOT_PLAN.decisions.map(([name, options, rationale, status], i) => (
            <tr key={name} className={i % 2 === 1 ? styles.trEven : undefined}>
              <td className={styles.td}>{name}</td>
              <td className={`${styles.td} ${styles.note}`}>{options}</td>
              <td className={styles.td}>{rationale}</td>
              <td className={styles.td}>
                <StatusPill value={status ?? 'Open'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <p className={styles.sub}>Who&rsquo;s contacted, what&rsquo;s next.</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Org / person</th>
            <th className={styles.th}>Known contact</th>
            <th className={styles.th}>Type</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Next step</th>
          </tr>
        </thead>
        <tbody>
          {PILOT_PLAN.contacts.map(([org, contact, type, status, next], i) => (
            <tr key={org} className={i % 2 === 1 ? styles.trEven : undefined}>
              <td className={styles.td} style={{ fontWeight: 600 }}>
                {org}
              </td>
              <td className={`${styles.td} ${styles.note}`}>{contact}</td>
              <td className={styles.td}>{type}</td>
              <td className={styles.td}>
                <StatusPill value={status} />
              </td>
              <td className={`${styles.td} ${styles.note}`}>{next}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
