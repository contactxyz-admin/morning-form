'use client';

/**
 * "This Week's 3" card on the Briefing — live when a CompanyOpsFocus row
 * exists for the current week, otherwise falls back to the plan snapshot
 * and invites the Monday reset the operating rhythm prescribes. Saves via
 * PUT /api/ops/focus (server keys the row to the current week).
 */
import { useState } from 'react';
import styles from './ops.module.css';
import { parseFocusItems } from './intelligence';

export interface FocusDto {
  items: string[];
  updatedBy: string;
  updatedAt: string;
}

export function FocusCard({ initialFocus, planFallback }: { initialFocus: FocusDto | null; planFallback: string[] }) {
  const [focus, setFocus] = useState(initialFocus);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    const seed = focus?.items ?? planFallback;
    setDrafts([seed[0] ?? '', seed[1] ?? '', seed[2] ?? '']);
    setEditing(true);
  }

  async function save() {
    const items = drafts.map((d) => d.trim()).filter(Boolean);
    if (items.length === 0) {
      setError('Set at least one priority.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ops/focus', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error();
      const { focus: saved } = (await res.json()) as {
        focus: { items: string; updatedBy: string; updatedAt: string };
      };
      // Fail-soft parse: a malformed response must not throw here and report
      // "Save failed" for a save that actually succeeded server-side.
      setFocus({ items: parseFocusItems(saved.items), updatedBy: saved.updatedBy, updatedAt: saved.updatedAt });
      setEditing(false);
    } catch {
      setError('Save failed — refresh and try again.');
    } finally {
      setSaving(false);
    }
  }

  const items = focus?.items ?? planFallback;

  return (
    <div className={styles.card}>
      <p className={styles.kick}>This week&rsquo;s 3</p>
      {editing ? (
        <>
          {drafts.map((draft, i) => (
            <input
              key={i}
              className={styles.inputCell}
              style={{ marginBottom: 6 }}
              value={draft}
              placeholder={`Priority ${i + 1}${i > 0 ? ' (optional)' : ''}`}
              aria-label={`Weekly priority ${i + 1}`}
              onChange={(e) => setDrafts((prev) => prev.map((d, di) => (di === i ? e.target.value : d)))}
            />
          ))}
          {error && <p className={styles.error}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className={styles.addBtn} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save for this week'}
            </button>
            <button type="button" className={styles.chipBtn} disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <ol className={styles.list}>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <p className={styles.note} style={{ marginTop: 8 }}>
            {focus
              ? `Set for this week by ${focus.updatedBy}.`
              : 'Snapshot from the plan (4 Jul) — no priorities set for this week yet.'}
          </p>
          <button type="button" className={styles.chipBtn} style={{ marginTop: 6 }} onClick={startEditing}>
            {focus ? 'Edit this week’s 3' : 'Set this week’s 3'}
          </button>
        </>
      )}
    </div>
  );
}
