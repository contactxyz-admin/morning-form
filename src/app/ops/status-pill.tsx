/**
 * Buckets the varied free-text status vocabulary across the reference tabs
 * (decision log, contacts/outreach) into the same 4-tone system the live
 * Workstream tab already uses, so "status" reads consistently everywhere.
 * No 'use client' directive: renders fine from server tabs and compiles
 * into the client bundle when imported by the interactive ones.
 */
import styles from './ops.module.css';

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

export function StatusPill({ value }: { value: string }) {
  return <span className={`${styles.pill} ${PILL_TONE[value] ?? styles.pillGrey}`}>{value}</span>;
}
