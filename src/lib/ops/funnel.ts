/**
 * Pilot funnel aggregates for the /ops Live KPIs tab (pilot MVP plan
 * 2026-07-04).
 *
 * AGGREGATE COUNTS ONLY. Founders see how many members moved through each
 * funnel stage, never individual rows — no emails, no names, no user ids,
 * no marker data leave this module. Keep it that way: anything added here
 * must be a number.
 *
 * Source of truth per stage is the owning TABLE where one exists (Priorities,
 * SourceDocument, Draw, BookingRequest, PilotSlotBooking, ResultReview) —
 * the funnel-event stream is additive telemetry, not the ledger (same stance
 * as DRAW_COMPLETED vs the Draw table). Event counts are reported alongside
 * as distinct-funnelId counts for the stages whose only record is the stream.
 */
import type { PrismaClient } from '@prisma/client';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';

export interface PilotFunnelSnapshot {
  generatedAt: string;
  /** Total registered members (any market, any state). */
  members: number;
  /** Members with a persisted protocol (Priorities rows are one-per-user). */
  protocolsDelivered: number;
  /** Concierge test requests by status, plus how many were retest-linked. */
  bookingRequests: { byStatus: Record<string, number>; retestLinked: number };
  /** In-gym slot bookings by status (booked | cancelled | attended). */
  slotBookings: Record<string, number>;
  /** Completed draws (a lab visit that yielded a panel). */
  drawsCompleted: number;
  /** Ingested lab documents by kind (lab_pdf | lab_csv | ...). */
  resultsIngested: Record<string, number>;
  /** Clinician review queue by status (pending | approved | escalated). */
  reviews: Record<string, number>;
  /**
   * Funnel-event stream stages, counted as DISTINCT funnelId per event so
   * entity-keyed re-fires (stable Priorities id, replayed uploads) never
   * inflate a stage.
   */
  eventStages: Record<string, number>;
}

/** The event-stream stages the KPIs tab charts, in funnel order. */
export const PILOT_EVENT_STAGES: readonly string[] = [
  FUNNEL_EVENTS.LANDING_VIEWED,
  FUNNEL_EVENTS.SIGNUP_COMPLETED,
  FUNNEL_EVENTS.ASSESSMENT_COMPLETED,
  FUNNEL_EVENTS.PROTOCOL_DELIVERED,
  FUNNEL_EVENTS.BOOKING_REQUESTED,
  FUNNEL_EVENTS.SLOT_BOOKED,
  FUNNEL_EVENTS.DRAW_COMPLETED,
  FUNNEL_EVENTS.RESULT_INGESTED,
  FUNNEL_EVENTS.RESULT_VIEWED,
];

function toStatusMap(groups: { status: string; _count: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of groups) out[g.status] = g._count;
  return out;
}

export async function getPilotFunnelSnapshot(db: PrismaClient): Promise<PilotFunnelSnapshot> {
  const [
    members,
    protocolsDelivered,
    bookingByStatus,
    retestLinked,
    slotBookingGroups,
    drawsCompleted,
    docGroups,
    reviewGroups,
    stageGroups,
  ] = await Promise.all([
    db.user.count(),
    db.priorities.count(),
    db.bookingRequest.groupBy({ by: ['status'], _count: true }),
    db.bookingRequest.count({ where: { drawId: { not: null } } }),
    db.pilotSlotBooking.groupBy({ by: ['status'], _count: true }),
    db.draw.count({ where: { status: 'completed' } }),
    db.sourceDocument.groupBy({ by: ['kind'], _count: true }),
    db.resultReview.groupBy({ by: ['status'], _count: true }),
    // Distinct funnelId per event: groupBy on the pair collapses re-fires of
    // the same entity; the pair count per event is the stage count.
    db.funnelEvent.groupBy({
      by: ['event', 'funnelId'],
      where: { event: { in: [...PILOT_EVENT_STAGES] } },
    }),
  ]);

  const eventStages: Record<string, number> = {};
  for (const stage of PILOT_EVENT_STAGES) eventStages[stage] = 0;
  for (const g of stageGroups) eventStages[g.event] = (eventStages[g.event] ?? 0) + 1;

  const resultsIngested: Record<string, number> = {};
  for (const g of docGroups) resultsIngested[g.kind] = g._count;

  return {
    generatedAt: new Date().toISOString(),
    members,
    protocolsDelivered,
    bookingRequests: { byStatus: toStatusMap(bookingByStatus), retestLinked },
    slotBookings: toStatusMap(slotBookingGroups),
    drawsCompleted,
    resultsIngested,
    reviews: toStatusMap(reviewGroups),
    eventStages,
  };
}
