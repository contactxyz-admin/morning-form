'use client';

/**
 * Decision Log — live over CompanyOpsDecision. The operating rule is "log
 * the call the day you make it", so open rows show how long they've sat in
 * the log and the status flip is a single click (the API owns decidedAt).
 * An empty table offers a one-shot import of the plan's reference rows.
 */
import { useRef, useState } from 'react';
import styles from './ops.module.css';
import { daysBetweenUtc } from './intelligence';
import { StatusPill } from './status-pill';

export interface OpsDecisionDto {
  id: string;
  name: string;
  options: string;
  rationale: string;
  status: 'open' | 'decided';
  decidedAt: string | null;
  createdAt: string;
  orderIndex: number;
}

type DecisionFilter = 'all' | 'open' | 'decided';
type DecisionPatch = Partial<Pick<OpsDecisionDto, 'name' | 'options' | 'rationale' | 'status'>>;

export function DecisionsClient({ initialDecisions }: { initialDecisions: OpsDecisionDto[] }) {
  const [decisions, setDecisions] = useState(initialDecisions);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DecisionFilter>('all');
  const [newName, setNewName] = useState('');
  const [importing, setImporting] = useState(false);

  const now = new Date();

  // Monotonic per-row edit counter (same convention as board-client): a slow
  // response for an old edit must not clobber a newer optimistic one.
  const editSeq = useRef(new Map<string, number>());

  async function patchDecision(id: string, patch: DecisionPatch) {
    const seq = (editSeq.current.get(id) ?? 0) + 1;
    editSeq.current.set(id, seq);
    setError(null);
    setDecisions((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    try {
      const res = await fetch(`/api/ops/decision/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const { decision } = (await res.json()) as { decision: OpsDecisionDto };
      if (editSeq.current.get(id) === seq) {
        setDecisions((prev) => prev.map((d) => (d.id === id ? decision : d)));
      }
    } catch {
      setError('Update failed — refresh to see the saved state.');
    }
  }

  async function deleteDecision(row: OpsDecisionDto) {
    if (!window.confirm(`Delete "${row.name}" from the log? This removes it for every founder.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/ops/decision/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setDecisions((prev) => prev.filter((d) => d.id !== row.id));
    } catch {
      setError('Delete failed — refresh and try again.');
    }
  }

  async function createDecision() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch('/api/ops/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const { decision } = (await res.json()) as { decision: OpsDecisionDto };
      setDecisions((prev) => [...prev, decision]);
      setNewName('');
    } catch {
      setError('Create failed — refresh and try again.');
    }
  }

  async function importFromPlan() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch('/api/ops/import-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'decisions' }),
      });
      if (!res.ok) throw new Error();
      const { decisions: imported } = (await res.json()) as { decisions: OpsDecisionDto[] };
      setDecisions(imported);
    } catch {
      setError('Import failed — refresh and try again.');
    } finally {
      setImporting(false);
    }
  }

  const openCount = decisions.filter((d) => d.status === 'open').length;
  const visible = decisions.filter((d) => filter === 'all' || d.status === filter);

  return (
    <>
      <h2 className={styles.h2}>Decision Log</h2>
      <p className={styles.sub}>Live log — log the call the day you make it. Open rows show how long they&rsquo;ve sat.</p>
      {error && <p className={styles.error}>{error}</p>}

      {decisions.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.kick}>No decisions logged yet</p>
          <p style={{ margin: '0 0 10px' }}>
            Start from the pilot plan&rsquo;s decision list, or log the first call below.
          </p>
          <button type="button" className={styles.addBtn} disabled={importing} onClick={() => void importFromPlan()}>
            {importing ? 'Importing…' : 'Import the plan’s decision list'}
          </button>
        </div>
      ) : (
        <div className={styles.toolbar}>
          {(['all', 'open', 'decided'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.chipBtn} ${filter === value ? styles.chipBtnOn : ''}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? 'All' : value === 'open' ? 'Open' : 'Decided'}
              <span className={styles.chipCount}>
                {value === 'all' ? decisions.length : value === 'open' ? openCount : decisions.length - openCount}
              </span>
            </button>
          ))}
        </div>
      )}

      {decisions.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Decision</th>
              <th className={styles.th}>Options</th>
              <th className={styles.th}>Decision / rationale</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td className={styles.emptyCell} colSpan={5}>
                  No decisions match this filter.
                </td>
              </tr>
            )}
            {visible.map((d, i) => {
              const openDays = daysBetweenUtc(d.createdAt, now);
              const decidedDays = d.decidedAt ? daysBetweenUtc(d.decidedAt, now) : null;
              return (
                <tr key={d.id} className={i % 2 === 1 ? styles.trEven : undefined}>
                  <td className={styles.td}>
                    <input
                      key={`name-${d.id}`}
                      className={styles.inputCell}
                      style={{ fontWeight: 600 }}
                      defaultValue={d.name}
                      aria-label={`Decision name: ${d.name}`}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== d.name && patchDecision(d.id, { name: e.target.value })}
                    />
                  </td>
                  <td className={styles.td}>
                    {/* Textareas, not inputs: options and especially rationale
                        run to whole paragraphs — a one-line field truncates the
                        exact reasoning the log exists to preserve. */}
                    <textarea
                      key={`options-${d.id}`}
                      className={`${styles.inputCell} ${styles.textareaCell}`}
                      rows={2}
                      defaultValue={d.options}
                      aria-label={`Options for ${d.name}`}
                      onBlur={(e) => e.target.value !== d.options && patchDecision(d.id, { options: e.target.value })}
                    />
                  </td>
                  <td className={styles.td}>
                    <textarea
                      key={`rationale-${d.id}`}
                      className={`${styles.inputCell} ${styles.textareaCell}`}
                      rows={3}
                      defaultValue={d.rationale}
                      aria-label={`Rationale for ${d.name}`}
                      onBlur={(e) => e.target.value !== d.rationale && patchDecision(d.id, { rationale: e.target.value })}
                    />
                  </td>
                  <td className={styles.td}>
                    <button
                      type="button"
                      className={styles.chipBtn}
                      aria-label={`${d.name}: ${d.status === 'open' ? 'mark decided' : 'reopen'}`}
                      onClick={() => patchDecision(d.id, { status: d.status === 'open' ? 'decided' : 'open' })}
                    >
                      {d.status === 'open' ? 'Mark decided' : 'Reopen'}
                    </button>
                    <div style={{ marginTop: 4 }}>
                      <StatusPill value={d.status === 'decided' ? 'Decided' : 'Open'} />{' '}
                      {/* Day-granular text can differ between SSR and hydration
                          across a midnight boundary. */}
                      <span className={styles.note} suppressHydrationWarning>
                        {d.status === 'open'
                          ? `in the log ${openDays === 0 ? 'since today' : `${openDays}d`}`
                          : decidedDays === null
                            ? ''
                            : decidedDays === 0
                              ? 'decided today'
                              : `decided ${decidedDays}d ago`}
                      </span>
                    </div>
                  </td>
                  <td className={styles.td}>
                    <button
                      className={styles.deleteBtn}
                      type="button"
                      aria-label={`Delete decision ${d.name}`}
                      onClick={() => deleteDecision(d)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className={styles.addRow}>
        <input
          className={`${styles.inputCell} ${styles.addInput}`}
          placeholder="New decision…"
          aria-label="New decision name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void createDecision();
          }}
        />
        <button className={styles.addBtn} type="button" onClick={() => void createDecision()}>
          + Log decision
        </button>
      </div>
    </>
  );
}
