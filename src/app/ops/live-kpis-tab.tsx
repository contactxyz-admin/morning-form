/**
 * Live KPIs — the one /ops tab backed by the product database rather than
 * the static reference plan (which keeps its own "Objectives & KPIs" tab
 * for the TARGETS; this tab is the ACTUALS).
 *
 * Founders see aggregate counts of member activity here, never individual
 * rows — the no-PII contract lives in src/lib/ops/funnel.ts; nothing this
 * component receives contains an email, name, user id, or marker value.
 */
import { prisma } from '@/lib/db';
import { getPilotFunnelSnapshot, PILOT_EVENT_STAGES } from '@/lib/ops/funnel';
import styles from './ops.module.css';

const STAGE_LABELS: Record<string, string> = {
  landing_viewed: 'Landing viewed',
  signup_completed: 'Signed up',
  assessment_completed: 'Assessment completed',
  protocol_delivered: 'Protocol delivered',
  booking_requested: 'Test requested (concierge)',
  slot_booked: 'Slot booked (in-gym)',
  draw_completed: 'Draw completed',
  result_ingested: 'Result returned',
  result_viewed: 'Result viewed',
};

function sum(map: Record<string, number>): number {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

export async function LiveKpisTab() {
  const snapshot = await getPilotFunnelSnapshot(prisma);
  const liveSlotBookings = snapshot.slotBookings['booked'] ?? 0;
  const pendingReviews = snapshot.reviews['pending'] ?? 0;

  const tiles: [string, number][] = [
    ['Members', snapshot.members],
    ['Protocols delivered', snapshot.protocolsDelivered],
    ['Test requests', sum(snapshot.bookingRequests.byStatus)],
    ['Live slot bookings', liveSlotBookings],
    ['Draws completed', snapshot.drawsCompleted],
    ['Results ingested', sum(snapshot.resultsIngested)],
    ['Reviews pending', pendingReviews],
    ['Retest-linked requests', snapshot.bookingRequests.retestLinked],
  ];

  return (
    <>
      <h2 className={styles.h2}>Live KPIs</h2>
      <p className={styles.sub}>
        Actuals, aggregated live from the product database. Targets live on the Objectives &amp; KPIs
        tab. Counts only — no member-level rows are shown here or fetched to render this.
      </p>

      <div className={styles.statGrid}>
        {tiles.map(([label, value]) => (
          <div key={label} className={styles.statTile}>
            <div className={styles.statNum}>{value}</div>
            <div className={styles.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      <div className={styles.card}>
        <p className={styles.kick}>Funnel stages (distinct entities per stage)</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Stage</th>
              <th className={styles.th}>Count</th>
            </tr>
          </thead>
          <tbody>
            {PILOT_EVENT_STAGES.map((stage, i) => (
              <tr key={stage} className={i % 2 === 1 ? styles.trEven : undefined}>
                <td className={styles.td}>{STAGE_LABELS[stage] ?? stage}</td>
                <td className={styles.td}>{snapshot.eventStages[stage] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.note} style={{ marginTop: 8 }}>
          Stage counts come from the funnel-event stream (older stages predate some events, so
          early-stage counts can lag the table totals above, which read the owning tables directly).
        </p>
      </div>

      <div className={styles.card}>
        <p className={styles.kick}>Breakdowns</p>
        <table className={styles.table}>
          <tbody>
            <tr>
              <td className={styles.td}>Concierge requests by status</td>
              <td className={`${styles.td} ${styles.note}`}>
                {Object.entries(snapshot.bookingRequests.byStatus)
                  .map(([status, count]) => `${status}: ${count}`)
                  .join('  ·  ') || 'none yet'}
              </td>
            </tr>
            <tr className={styles.trEven}>
              <td className={styles.td}>Slot bookings by status</td>
              <td className={`${styles.td} ${styles.note}`}>
                {Object.entries(snapshot.slotBookings)
                  .map(([status, count]) => `${status}: ${count}`)
                  .join('  ·  ') || 'none yet'}
              </td>
            </tr>
            <tr>
              <td className={styles.td}>Results by source kind</td>
              <td className={`${styles.td} ${styles.note}`}>
                {Object.entries(snapshot.resultsIngested)
                  .map(([kind, count]) => `${kind}: ${count}`)
                  .join('  ·  ') || 'none yet'}
              </td>
            </tr>
            <tr className={styles.trEven}>
              <td className={styles.td}>Clinician reviews by status</td>
              <td className={`${styles.td} ${styles.note}`}>
                {Object.entries(snapshot.reviews)
                  .map(([status, count]) => `${status}: ${count}`)
                  .join('  ·  ') || 'none yet'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
