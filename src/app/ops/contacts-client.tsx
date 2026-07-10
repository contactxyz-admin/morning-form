'use client';

/**
 * Contacts & Outreach — live pipeline over CompanyOpsContact (the promoted
 * successor to the static plan list). Bucket chips answer "what does this
 * demand of us today"; every edit persists through /api/ops/contact and
 * bumps the row's last-touched clock, which drives the staleness column.
 * An empty table offers a one-shot import of the plan's reference rows.
 */
import { useState } from 'react';
import styles from './ops.module.css';
import { OPS_CONTACT_STATUS_VALUES } from '@/lib/ops/schema';
import { CONTACT_BUCKET_LABELS, CONTACT_BUCKETS, contactBucket, daysBetweenUtc, type ContactBucket } from './intelligence';
import { StatusPill } from './status-pill';

export interface OpsContactDto {
  id: string;
  org: string;
  contact: string;
  type: string;
  status: string;
  nextStep: string;
  orderIndex: number;
  updatedAt: string;
}

type BucketFilter = 'all' | ContactBucket;
type ContactPatch = Partial<Pick<OpsContactDto, 'org' | 'contact' | 'type' | 'status' | 'nextStep'>>;

/** Days without a touch after which an active-pipeline row gets flagged. */
const STALE_DAYS = 5;

export function ContactsClient({ initialContacts }: { initialContacts: OpsContactDto[] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [error, setError] = useState<string | null>(null);
  const [bucket, setBucket] = useState<BucketFilter>('all');
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [importing, setImporting] = useState(false);

  const now = new Date();

  async function patchContact(id: string, patch: ContactPatch) {
    setError(null);
    try {
      const res = await fetch(`/api/ops/contact/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const { contact } = (await res.json()) as { contact: OpsContactDto };
      setContacts((prev) => prev.map((c) => (c.id === id ? contact : c)));
    } catch {
      setError('Update failed — refresh and try again.');
    }
  }

  async function deleteContact(row: OpsContactDto) {
    if (!window.confirm(`Delete "${row.org}" from the pipeline? This removes it for every founder.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/ops/contact/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setContacts((prev) => prev.filter((c) => c.id !== row.id));
    } catch {
      setError('Delete failed — refresh and try again.');
    }
  }

  async function createContact() {
    const org = newOrg.trim();
    if (!org) return;
    setError(null);
    try {
      const res = await fetch('/api/ops/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ org }),
      });
      if (!res.ok) throw new Error();
      const { contact } = (await res.json()) as { contact: OpsContactDto };
      setContacts((prev) => [...prev, contact]);
      setNewOrg('');
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
        body: JSON.stringify({ kind: 'contacts' }),
      });
      if (!res.ok) throw new Error();
      const { contacts: imported } = (await res.json()) as { contacts: OpsContactDto[] };
      setContacts(imported);
    } catch {
      setError('Import failed — refresh and try again.');
    } finally {
      setImporting(false);
    }
  }

  const types = Array.from(new Set(contacts.map((c) => c.type).filter(Boolean)));
  const bucketCounts: Record<ContactBucket, number> = { act_now: 0, waiting: 0, queue: 0, done: 0, parked: 0 };
  for (const c of contacts) bucketCounts[contactBucket(c.status)] += 1;

  const q = query.trim().toLowerCase();
  const visible = contacts.filter((c) => {
    if (bucket !== 'all' && contactBucket(c.status) !== bucket) return false;
    if (type !== 'all' && c.type !== type) return false;
    if (q && !`${c.org} ${c.contact} ${c.nextStep}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <>
      <h2 className={styles.h2}>Contacts &amp; Outreach</h2>
      <p className={styles.sub}>
        Live pipeline — edits save for every founder. Bucketed by what each contact demands of us today; &ldquo;last
        touch&rdquo; flags anything in play that hasn&rsquo;t moved in {STALE_DAYS}+ days.
      </p>
      {error && <p className={styles.error}>{error}</p>}

      {contacts.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.kick}>No contacts yet</p>
          <p style={{ margin: '0 0 10px' }}>
            Start from the pilot plan&rsquo;s outreach list, or add contacts one by one below.
          </p>
          <button type="button" className={styles.addBtn} disabled={importing} onClick={() => void importFromPlan()}>
            {importing ? 'Importing…' : 'Import the plan’s outreach list'}
          </button>
        </div>
      ) : (
        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.chipBtn} ${bucket === 'all' ? styles.chipBtnOn : ''}`}
            aria-pressed={bucket === 'all'}
            onClick={() => setBucket('all')}
          >
            All<span className={styles.chipCount}>{contacts.length}</span>
          </button>
          {CONTACT_BUCKETS.map((b) => (
            <button
              key={b}
              type="button"
              className={`${styles.chipBtn} ${bucket === b ? styles.chipBtnOn : ''}`}
              aria-pressed={bucket === b}
              onClick={() => setBucket(b)}
            >
              {CONTACT_BUCKET_LABELS[b]}
              <span className={styles.chipCount}>{bucketCounts[b]}</span>
            </button>
          ))}
          <select
            className={styles.ownerSelect}
            style={{ width: 'auto' }}
            aria-label="Filter by contact type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            className={`${styles.inputCell} ${styles.search}`}
            type="search"
            placeholder="Search contacts…"
            aria-label="Search contacts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {contacts.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Org / person</th>
              <th className={styles.th}>Known contact</th>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Next step</th>
              <th className={styles.th}>Last touch</th>
              <th className={styles.th} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td className={styles.emptyCell} colSpan={7}>
                  No contacts match these filters.
                </td>
              </tr>
            )}
            {visible.map((c, i) => {
              const days = daysBetweenUtc(c.updatedAt, now);
              const inPlay = contactBucket(c.status) === 'act_now' || contactBucket(c.status) === 'waiting';
              const stale = inPlay && days >= STALE_DAYS;
              return (
                <tr key={c.id} className={i % 2 === 1 ? styles.trEven : undefined}>
                  <td className={styles.td}>
                    <input
                      key={`org-${c.id}`}
                      className={styles.inputCell}
                      style={{ fontWeight: 600 }}
                      defaultValue={c.org}
                      aria-label={`Organisation for ${c.org}`}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== c.org && patchContact(c.id, { org: e.target.value })}
                    />
                  </td>
                  <td className={styles.td}>
                    <input
                      key={`contact-${c.id}`}
                      className={styles.inputCell}
                      defaultValue={c.contact}
                      aria-label={`Known contact at ${c.org}`}
                      onBlur={(e) => e.target.value !== c.contact && patchContact(c.id, { contact: e.target.value })}
                    />
                  </td>
                  <td className={styles.td}>
                    <input
                      key={`type-${c.id}`}
                      className={styles.inputCell}
                      defaultValue={c.type}
                      aria-label={`Type for ${c.org}`}
                      onBlur={(e) => e.target.value !== c.type && patchContact(c.id, { type: e.target.value })}
                    />
                  </td>
                  <td className={styles.td}>
                    <select
                      className={styles.ownerSelect}
                      value={c.status}
                      aria-label={`Status for ${c.org}`}
                      onChange={(e) => patchContact(c.id, { status: e.target.value })}
                    >
                      {OPS_CONTACT_STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <div style={{ marginTop: 4 }}>
                      <StatusPill value={c.status} />
                    </div>
                  </td>
                  <td className={styles.td}>
                    <input
                      key={`next-${c.id}`}
                      className={styles.inputCell}
                      defaultValue={c.nextStep}
                      aria-label={`Next step for ${c.org}`}
                      onBlur={(e) => e.target.value !== c.nextStep && patchContact(c.id, { nextStep: e.target.value })}
                    />
                  </td>
                  <td className={styles.td}>
                    <span className={stale ? styles.dueTag : styles.note}>
                      {days === 0 ? 'today' : `${days}d ago`}
                      {stale ? ' · stale' : ''}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <button
                      className={styles.deleteBtn}
                      type="button"
                      aria-label={`Delete contact ${c.org}`}
                      onClick={() => deleteContact(c)}
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
          placeholder="New org / person…"
          aria-label="New contact organisation"
          value={newOrg}
          onChange={(e) => setNewOrg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void createContact();
          }}
        />
        <button className={styles.addBtn} type="button" onClick={() => void createContact()}>
          + Add contact
        </button>
      </div>
    </>
  );
}
