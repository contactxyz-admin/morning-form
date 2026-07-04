'use client';

import { Fragment, useState } from 'react';
import styles from './ops.module.css';

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

  async function patchTask(id: string, patch: TaskPatch) {
    setError(null);
    try {
      const res = await fetch(`/api/ops/task/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const { task } = (await res.json()) as { task: OpsTaskDto };
      setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    } catch {
      setError('Update failed — refresh and try again.');
    }
  }

  async function deleteTask(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/ops/task/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setTasks((prev) => prev.filter((t) => t.id !== id));
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
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
      const { task } = (await res.json()) as { task: OpsTaskDto };
      setTasks((prev) => [...prev, task]);
      setNewTitle('');
    } catch {
      setError('Create failed — refresh and try again.');
    }
  }

  const groups: { phase: string; rows: OpsTaskDto[] }[] = [];
  for (const t of tasks) {
    const current = groups[groups.length - 1];
    if (current && current.phase === t.phase) current.rows.push(t);
    else groups.push({ phase: t.phase, rows: [t] });
  }

  return (
    <div>
      {error && <p className={styles.error}>{error}</p>}
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
          {groups.map((group, gi) => (
            <Fragment key={`${group.phase}-${gi}`}>
              <tr>
                <td className={styles.phaseRow} colSpan={6}>
                  {group.phase || 'Unphased'}
                </td>
              </tr>
              {group.rows.map((t, i) => (
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
                      className={styles.inputCell}
                      defaultValue={t.dueDate ? t.dueDate.slice(0, 10) : ''}
                      onBlur={(e) => patchTask(t.id, { dueDate: e.target.value || null })}
                    />
                  </td>
                  <td className={styles.td}>
                    <button
                      className={styles.deleteBtn}
                      type="button"
                      aria-label="Delete task"
                      onClick={() => deleteTask(t.id)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className={styles.addRow}>
        <input
          className={`${styles.inputCell} ${styles.addInput}`}
          placeholder="New task title…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void createTask();
          }}
        />
        <button className={styles.addBtn} type="button" onClick={() => void createTask()}>
          + Add task
        </button>
      </div>
    </div>
  );
}
