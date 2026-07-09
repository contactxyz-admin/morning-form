'use client';

/**
 * Decision log with a one-glance open/decided split — the operating rule is
 * "log the call the day you make it", so the open count is the nag.
 */
import { useState } from 'react';
import styles from './ops.module.css';
import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';
import { StatusPill } from './status-pill';

type DecisionFilter = 'all' | 'Open' | 'Decided';

// Plan rows are variable-length tuples; missing status means the call is
// still open, missing rationale means nothing has been written down yet.
const ROWS = PILOT_PLAN.decisions.map(([name, options, rationale, status]) => ({
  name,
  options,
  rationale: rationale ?? '—',
  status: status === 'Decided' ? ('Decided' as const) : ('Open' as const),
}));

export function DecisionsClient() {
  const [filter, setFilter] = useState<DecisionFilter>('all');
  const openCount = ROWS.filter((d) => d.status === 'Open').length;
  const visible = ROWS.filter((d) => filter === 'all' || d.status === filter);

  return (
    <>
      <div className={styles.toolbar}>
        {(['all', 'Open', 'Decided'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`${styles.chipBtn} ${filter === value ? styles.chipBtnOn : ''}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? 'All' : value}
            <span className={styles.chipCount}>
              {value === 'all' ? ROWS.length : value === 'Open' ? openCount : ROWS.length - openCount}
            </span>
          </button>
        ))}
      </div>
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
          {visible.map((row, i) => (
            <tr key={row.name} className={i % 2 === 1 ? styles.trEven : undefined}>
              <td className={styles.td}>{row.name}</td>
              <td className={`${styles.td} ${styles.note}`}>{row.options}</td>
              <td className={styles.td}>{row.rationale}</td>
              <td className={styles.td}>
                <StatusPill value={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
