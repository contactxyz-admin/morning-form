'use client';

/**
 * Contacts & outreach as a working pipeline instead of a flat table: bucket
 * chips ("what does this demand of us today"), a type filter, and search.
 * Data still comes from the static plan — when outreach goes truly live,
 * promote it to a table the way CompanyOpsTask works.
 */
import { useMemo, useState } from 'react';
import styles from './ops.module.css';
import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';
import { CONTACT_BUCKET_LABELS, CONTACT_BUCKETS, contactBucket, type ContactBucket } from './intelligence';
import { StatusPill } from './status-pill';

type BucketFilter = 'all' | ContactBucket;

export function ContactsClient() {
  const [bucket, setBucket] = useState<BucketFilter>('all');
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');

  const contacts = PILOT_PLAN.contacts;
  const types = useMemo(() => Array.from(new Set(contacts.map(([, , t]) => t))), [contacts]);
  const bucketCounts = useMemo(() => {
    const counts: Record<ContactBucket, number> = { act_now: 0, waiting: 0, queue: 0, done: 0, parked: 0 };
    for (const [, , , status] of contacts) counts[contactBucket(status)] += 1;
    return counts;
  }, [contacts]);

  const q = query.trim().toLowerCase();
  const visible = contacts.filter(([org, contact, contactType, status, next]) => {
    if (bucket !== 'all' && contactBucket(status) !== bucket) return false;
    if (type !== 'all' && contactType !== type) return false;
    if (q && !`${org} ${contact} ${next}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <>
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
          {visible.length === 0 && (
            <tr>
              <td className={styles.emptyCell} colSpan={5}>
                No contacts match these filters.
              </td>
            </tr>
          )}
          {visible.map(([org, contact, contactType, status, next], i) => (
            <tr key={org} className={i % 2 === 1 ? styles.trEven : undefined}>
              <td className={styles.td} style={{ fontWeight: 600 }}>
                {org}
              </td>
              <td className={`${styles.td} ${styles.note}`}>{contact}</td>
              <td className={styles.td}>{contactType}</td>
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
