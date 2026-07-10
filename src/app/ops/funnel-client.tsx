'use client';

/**
 * Pilot funnel worked backwards from the draw goal at the KPI tab's target
 * conversion rates: pick the 50 or 100 draw scenario and see what every
 * stage upstream and downstream has to produce. Bar widths are linear in
 * headcount — the drop from "members reached" to "retest booked" is the
 * honest, uncomfortable point of the chart.
 */
import { useState } from 'react';
import styles from './ops.module.css';
import { funnelScenario } from './intelligence';

const SCENARIOS = [50, 100] as const;
/** The stage the pilot is judged on — KPI "Draws completed in pilot: 50–100". */
const GOAL_STAGE = 'Drawn (sample taken)';

export function FunnelClient() {
  const [draws, setDraws] = useState<(typeof SCENARIOS)[number]>(100);
  const stages = funnelScenario(draws);
  const max = stages[0].count;

  return (
    <div className={styles.card}>
      <div className={styles.toolbar}>
        <span className={styles.kick} style={{ margin: 0 }}>
          Draw goal
        </span>
        <span className={styles.toggleGroup} role="group" aria-label="Draw goal scenario">
          {SCENARIOS.map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.chipBtn} ${draws === n ? styles.chipBtnOn : ''}`}
              aria-pressed={draws === n}
              onClick={() => setDraws(n)}
            >
              {n} draws
            </button>
          ))}
        </span>
      </div>
      <p className={styles.funnelSummary}>
        To bank <b>{draws} draws</b> at target conversion, reach <b>~{stages[0].count.toLocaleString('en-GB')}</b>{' '}
        members → <b>{stages[1].count}</b> bookings → <b>{stages[4].count}</b> protocols →{' '}
        <b>~{stages[5].count}</b> retests booked.
      </p>
      {stages.map((stage) => (
        <div key={stage.label} className={styles.funnelRow}>
          <span className={styles.funnelLabel}>
            {stage.label}
            {stage.rateLabel && <span className={styles.funnelRate}>{stage.rateLabel}</span>}
          </span>
          <span className={styles.funnelBarWrap}>
            <span
              className={`${styles.funnelBar} ${stage.label === GOAL_STAGE ? styles.funnelBarGoal : ''}`}
              style={{ width: `${(stage.count / max) * 100}%` }}
              aria-hidden="true"
            />
            <span className={styles.funnelCount}>{stage.count.toLocaleString('en-GB')}</span>
            {/* Text marker so the goal stage never rides on bar color alone. */}
            {stage.label === GOAL_STAGE && <span className={styles.todayPill}>Goal</span>}
          </span>
        </div>
      ))}
      <p className={styles.sandboxNote}>
        Targets from the Objectives &amp; KPIs tab. Actual counts wire in when the ops funnel dashboard lands (W3–4
        build plan).
      </p>
    </div>
  );
}
