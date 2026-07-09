'use client';

/**
 * Interactive what-if sandbox over the partner scorecard: click a score to
 * cycle it 1–5, edit criterion weights, watch the weighted totals + ranks
 * re-rank live. Deliberately not persisted — the plan's hypothesis stays the
 * baseline; deltas against it are shown so a "what would it take" exploration
 * can't quietly overwrite the starting position.
 */
import { useMemo, useState } from 'react';
import styles from './ops.module.css';
import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';
import { baselineScorecard, cycleScore, ranks, weightedTotals } from './scorecard-math';

export function ScorecardClient() {
  const [state, setState] = useState(baselineScorecard);
  const baseline = useMemo(() => weightedTotals(baselineScorecard()), []);

  const totals = weightedTotals(state);
  const rankByPartner = ranks(totals);
  const leaderIndex = rankByPartner.indexOf(1);
  const weightSum = state.weights.reduce((a, w) => a + w, 0);
  const dirty =
    JSON.stringify(state.scores) !== JSON.stringify(baselineScorecard().scores) ||
    JSON.stringify(state.weights) !== JSON.stringify(baselineScorecard().weights);

  function setScore(c: number, p: number) {
    setState((prev) => ({
      ...prev,
      scores: prev.scores.map((row, ci) => (ci === c ? row.map((s, pi) => (pi === p ? cycleScore(s) : s)) : row)),
    }));
  }

  function setWeight(c: number, value: number) {
    setState((prev) => ({
      ...prev,
      weights: prev.weights.map((w, ci) => (ci === c ? Math.max(0, value) : w)),
    }));
  }

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Criterion</th>
            <th className={styles.th}>Wt %</th>
            {PILOT_PLAN.partners.map((p, pi) => (
              <th className={`${styles.th}`} key={p}>
                {p}
                {pi === leaderIndex && <span className={styles.leaderPill}>Leader</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PILOT_PLAN.criteria.map(([name], c) => (
            <tr key={name} className={c % 2 === 1 ? styles.trEven : undefined}>
              <td className={styles.td}>{name}</td>
              <td className={styles.td}>
                <input
                  className={styles.weightInput}
                  type="number"
                  min={0}
                  max={99}
                  value={state.weights[c]}
                  aria-label={`Weight for ${name}`}
                  onChange={(e) => setWeight(c, Number(e.target.value))}
                />
              </td>
              {state.scores[c].map((score, p) => (
                <td className={`${styles.td} ${p === leaderIndex ? styles.leaderCol : ''}`} key={p}>
                  <button
                    type="button"
                    className={styles.scoreBtn}
                    title="Click to cycle 1–5"
                    aria-label={`${PILOT_PLAN.partners[p]} on ${name}: ${score} of 5 — click to cycle`}
                    onClick={() => setScore(c, p)}
                  >
                    {score}
                  </button>
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className={`${styles.td} ${styles.tot}`}>Weighted (1–5)</td>
            <td className={`${styles.td} ${styles.note}`}>{weightSum > 0 ? `${weightSum} pts` : 'no weight'}</td>
            {totals.map((t, pi) => {
              const delta = t - baseline[pi];
              return (
                <td className={`${styles.td} ${styles.tot} ${pi === leaderIndex ? styles.leaderCol : ''}`} key={pi}>
                  {t.toFixed(2)}
                  {Math.abs(delta) >= 0.005 && (
                    <span className={styles.delta}>
                      {delta > 0 ? '+' : '−'}
                      {Math.abs(delta).toFixed(2)} vs plan
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
          <tr>
            <td className={`${styles.td} ${styles.tot}`}>Rank</td>
            <td className={styles.td} />
            {rankByPartner.map((r, pi) => (
              <td className={`${styles.td} ${styles.tot} ${pi === leaderIndex ? styles.leaderCol : ''}`} key={pi}>
                #{r}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className={styles.sandboxNote}>
        Sandbox — click scores to cycle 1–5 and edit weights; ranking recomputes live. Nothing is saved: reload (or{' '}
        <button type="button" className={styles.chipBtn} onClick={() => setState(baselineScorecard())} disabled={!dirty}>
          reset to plan
        </button>
        ) restores the starting hypotheses.
      </p>
    </>
  );
}
