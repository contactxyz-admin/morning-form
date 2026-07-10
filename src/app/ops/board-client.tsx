'use client';

import { Fragment, useRef, useState } from 'react';
import styles from './ops.module.css';
import { dueDateInputValue, groupTasksByPhase } from './board-grouping';
import { filterTasks, taskDueState, type BoardFilters, type BoardStatusFilter } from './intelligence';

export interface OpsTaskDto {
  id: string;
  board: string;
  title: string;
  detail: string;
  phase: string;
  ownerEmail: string | null;
  status: 'not_started' | 'in_progress' | 'blocked' | 'done';
  dueDate: string | null;
  orderIndex: number;
}

export interface OpsMemberDto {
  email: string;
  name: string;
}

const STATUS_LABELS: Record<OpsTaskDto['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

const STATUS_CLASS: Record<OpsTaskDto['status'], string> = {
  not_started: styles.statusNotStarted,
  in_progress: styles.statusInProgress,
  blocked: styles.statusBlocked,
  done: styles.statusDone,
};

/** Toolbar status chips, in scan order: everything, live work, trouble, backlog, finished. */
const STATUS_CHIPS: { value: BoardStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'not_started', label: 'Not started' },
  { value: 'done', label: 'Done' },
];

type TaskPatch = Partial<Pick<OpsTaskDto, 'title' | 'detail' | 'ownerEmail' | 'status' | 'dueDate'>>;

export function OpsBoardClient({
  initialTasks,
  members,
}: {
  initialTasks: OpsTaskDto[];
  members: OpsMemberDto[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newPhase, setNewPhase] = useState('');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState<BoardFilters['owner']>('all');
  const [status, setStatus] = useState<BoardStatusFilter>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // One clock per render pass keeps every row's overdue check consistent,
  // and any interaction (filtering, editing) naturally refreshes it — no
  // frozen-at-mount date drifting stale across midnight.
  const now = new Date();

  // Monotonic per-row edit counter: a slow response for an OLD edit must not
  // clobber a newer one already applied optimistically (two quick status
  // changes racing would otherwise leave the stale value on screen).
  const editSeq = useRef(new Map<string, number>());

  async function patchTask(id: string, patch: TaskPatch) {
    const seq = (editSeq.current.get(id) ?? 0) + 1;
    editSeq.current.set(id, seq);
    setError(null);
    // Optimistic: selects would otherwise visibly snap back for the whole round-trip.
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    try {
      const res = await fetch(`/api/ops/task/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const { task } = (await res.json()) as { task: OpsTaskDto };
      if (editSeq.current.get(id) === seq) {
        setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
      }
    } catch {
      setError('Update failed — refresh to see the saved state.');
    }
  }

  async function deleteTask(task: OpsTaskDto) {
    if (!window.confirm(`Delete "${task.title}"? This removes it for every founder.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/ops/task/${task.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      setError('Delete failed — refresh and try again.');
    }
  }

  async function createTask() {
    const title = newTitle.trim();
    if (!title) return;
    setError(null);
    try {
      const res = await fetch('/api/ops/task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, ...(newPhase ? { phase: newPhase } : {}) }),
      });
      if (!res.ok) throw new Error();
      const { task } = (await res.json()) as { task: OpsTaskDto };
      setTasks((prev) => [...prev, task]);
      setNewTitle('');
      // The new row must be visible immediately — a silent save under an
      // active filter or collapsed phase reads as a failed create and invites
      // a duplicate. Clear anything that would hide it.
      setQuery('');
      setOwner('all');
      setStatus('all');
      setCollapsed((prev) => {
        if (!prev.has(task.phase)) return prev;
        const next = new Set(prev);
        next.delete(task.phase);
        return next;
      });
    } catch {
      setError('Create failed — refresh and try again.');
    }
  }

  function togglePhase(phase: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const blockedCount = tasks.filter((t) => t.status === 'blocked').length;
  const overdueCount = tasks.filter((t) => taskDueState(t, now) === 'overdue').length;
  const donePct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  const filtersActive = query.trim() !== '' || owner !== 'all' || status !== 'all';
  const visible = filterTasks(tasks, { query, owner, status }, now);
  const groups = groupTasksByPhase(visible);
  const phases = Array.from(new Set(tasks.map((t) => t.phase).filter(Boolean)));

  return (
    <div>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.summaryStrip}>
        <span className={styles.summaryText}>
          {tasks.length} tasks · {doneCount} done ({donePct}%) · {blockedCount} blocked · {overdueCount} overdue
        </span>
        <span className={styles.summaryTrack} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: `${donePct}%` }} />
        </span>
      </div>

      <div className={styles.toolbar}>
        <input
          className={`${styles.inputCell} ${styles.search}`}
          type="search"
          placeholder="Search tasks…"
          aria-label="Search tasks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className={styles.ownerSelect}
          style={{ width: 'auto' }}
          aria-label="Filter by owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="all">All owners</option>
          {members.map((m) => (
            <option key={m.email} value={m.email}>
              {m.name}
            </option>
          ))}
          <option value="unassigned">Unassigned</option>
        </select>
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={`${styles.chipBtn} ${status === chip.value ? styles.chipBtnOn : ''}`}
            aria-pressed={status === chip.value}
            onClick={() => setStatus(chip.value)}
          >
            {chip.label}
            {chip.value === 'overdue' && overdueCount > 0 && <span className={styles.chipCount}>{overdueCount}</span>}
          </button>
        ))}
        {filtersActive && (
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => {
              setQuery('');
              setOwner('all');
              setStatus('all');
            }}
          >
            Clear ({visible.length} of {tasks.length})
          </button>
        )}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Title</th>
            <th className={styles.th}>Detail</th>
            <th className={styles.th}>Owner</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Due date</th>
            <th className={styles.th} />
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && (
            <tr>
              <td className={styles.emptyCell} colSpan={6}>
                {tasks.length === 0 ? 'No tasks yet — add the first one below.' : 'No tasks match these filters.'}
              </td>
            </tr>
          )}
          {groups.map((group) => {
            const phaseDone = group.rows.filter((t) => t.status === 'done').length;
            const isCollapsed = collapsed.has(group.phase);
            return (
              // Phase text alone is unique (groupTasksByPhase dedupes) and
              // stable: an index-suffixed key would remount every later group
              // (wiping in-flight uncontrolled edits) whenever an async PATCH
              // response makes an earlier group appear or disappear under an
              // active filter.
              <Fragment key={group.phase || '∅unphased'}>
                <tr>
                  <td className={styles.phaseRow} colSpan={6}>
                    <button
                      type="button"
                      className={styles.phaseHeaderBtn}
                      aria-expanded={!isCollapsed}
                      onClick={() => togglePhase(group.phase)}
                    >
                      <span className={`${styles.caret} ${!isCollapsed ? styles.caretOpen : ''}`} aria-hidden="true">
                        ▶
                      </span>
                      {group.phase || 'Unphased'}
                      <span className={styles.phaseCount}>
                        {phaseDone}/{group.rows.length} done
                      </span>
                      <span className={styles.phaseTrack} aria-hidden="true">
                        <span
                          className={styles.progressFill}
                          style={{ width: `${group.rows.length ? (phaseDone / group.rows.length) * 100 : 0}%` }}
                        />
                      </span>
                    </button>
                  </td>
                </tr>
                {!isCollapsed &&
                  group.rows.map((t, i) => {
                    const dueState = taskDueState(t, now);
                    return (
                      <tr key={t.id} className={i % 2 === 1 ? styles.trEven : undefined}>
                        <td className={styles.td}>
                          <input
                            key={`title-${t.id}`}
                            className={styles.inputCell}
                            defaultValue={t.title}
                            onBlur={(e) => e.target.value !== t.title && patchTask(t.id, { title: e.target.value })}
                          />
                        </td>
                        <td className={styles.td}>
                          <input
                            key={`detail-${t.id}`}
                            className={styles.inputCell}
                            defaultValue={t.detail}
                            onBlur={(e) => e.target.value !== t.detail && patchTask(t.id, { detail: e.target.value })}
                          />
                        </td>
                        <td className={styles.td}>
                          <select
                            className={styles.ownerSelect}
                            value={t.ownerEmail ?? ''}
                            onChange={(e) => patchTask(t.id, { ownerEmail: e.target.value || null })}
                          >
                            <option value="">Unassigned</option>
                            {members.map((m) => (
                              <option key={m.email} value={m.email}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={styles.td}>
                          <select
                            className={`${styles.statusSelect} ${STATUS_CLASS[t.status]}`}
                            value={t.status}
                            onChange={(e) => patchTask(t.id, { status: e.target.value as OpsTaskDto['status'] })}
                          >
                            {(Object.keys(STATUS_LABELS) as OpsTaskDto['status'][]).map((value) => (
                              <option key={value} value={value}>
                                {STATUS_LABELS[value]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={styles.td}>
                          <input
                            key={`due-${t.id}`}
                            type="date"
                            className={`${styles.inputCell} ${
                              dueState === 'overdue' ? styles.dueOverdue : dueState === 'due_soon' ? styles.dueSoonCell : ''
                            }`}
                            defaultValue={dueDateInputValue(t.dueDate)}
                            onBlur={(e) =>
                              e.target.value !== dueDateInputValue(t.dueDate) &&
                              patchTask(t.id, { dueDate: e.target.value || null })
                            }
                          />
                          {dueState === 'overdue' && <span className={styles.dueTag}>Overdue</span>}
                          {dueState === 'due_soon' && (
                            <span className={`${styles.dueTag} ${styles.dueTagSoon}`}>Due soon</span>
                          )}
                        </td>
                        <td className={styles.td}>
                          <button
                            className={styles.deleteBtn}
                            type="button"
                            aria-label={`Delete task ${t.title}`}
                            onClick={() => deleteTask(t)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className={styles.addRow}>
        <input
          className={`${styles.inputCell} ${styles.addInput}`}
          placeholder="New task title…"
          aria-label="New task title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void createTask();
          }}
        />
        <select
          className={styles.ownerSelect}
          style={{ width: 'auto' }}
          aria-label="Phase for new task"
          value={newPhase}
          onChange={(e) => setNewPhase(e.target.value)}
        >
          <option value="">Unphased</option>
          {phases.map((phase) => (
            <option key={phase} value={phase}>
              {phase}
            </option>
          ))}
        </select>
        <button className={styles.addBtn} type="button" onClick={() => void createTask()}>
          + Add task
        </button>
      </div>
    </div>
  );
}
