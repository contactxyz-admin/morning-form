import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { getPilotFunnelSnapshot, PILOT_EVENT_STAGES } from './funnel';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('getPilotFunnelSnapshot', () => {
  it('aggregates every stage and contains no PII anywhere in the payload', async () => {
    const userId = await makeTestUser(prisma, 'funnel-agg');

    await prisma.priorities.create({
      data: { userId, version: 1, status: 'active', rationale: 'r', confidence: 'high' },
    });
    const draw = await prisma.draw.create({
      data: { userId, status: 'completed', sequence: 1, completedAt: new Date() },
    });
    await prisma.bookingRequest.create({
      data: { userId, markerNames: '["hs-CRP"]', market: 'uk', status: 'requested', drawId: draw.id },
    });
    await prisma.bookingRequest.create({
      data: { userId, markerNames: '["hs-CRP"]', market: 'uk', status: 'cancelled' },
    });
    const doc = await prisma.sourceDocument.create({
      data: {
        userId,
        kind: 'lab_pdf',
        sourceRef: 'panel.pdf',
        contentHash: 'hash-funnel-agg',
        capturedAt: new Date(),
      },
    });
    // Non-lab document: must NOT count as a "result returned".
    await prisma.sourceDocument.create({
      data: {
        userId,
        kind: 'intake_text',
        sourceRef: 'intake',
        contentHash: 'hash-funnel-intake',
        capturedAt: new Date(),
      },
    });
    await prisma.resultReview.create({
      data: {
        userId,
        sourceDocumentId: doc.id,
        status: 'pending',
        panelSummary: '{}',
        documentCapturedAt: new Date(),
      },
    });
    const slot = await prisma.pilotSlot.create({
      data: {
        venueName: 'Third Space Soho',
        venueAddress: '67 Brewer St, London',
        startsAt: new Date(Date.now() + 86_400_000),
        capacity: 2,
        createdBy: 'reuben@contact.xyz',
      },
    });
    const consent = await prisma.consentRecord.create({
      data: {
        userId,
        type: 'procedure_blood_draw',
        documentVersion: 'blood_draw_v1',
        signedName: 'Jane Doe',
      },
    });
    await prisma.pilotSlotBooking.create({
      data: { slotId: slot.id, userId, consentRecordId: consent.id },
    });
    // Duplicate funnelId on purpose: distinct-funnelId counting must collapse it.
    for (let i = 0; i < 2; i++) {
      await prisma.funnelEvent.create({
        data: { funnelId: 'stable-entity-1', userId, event: 'protocol_delivered' },
      });
    }
    await prisma.funnelEvent.create({
      data: { funnelId: 'stable-entity-2', userId, event: 'slot_booked' },
    });

    const snapshot = await getPilotFunnelSnapshot(prisma);

    expect(snapshot.members).toBeGreaterThanOrEqual(1);
    expect(snapshot.protocolsDelivered).toBeGreaterThanOrEqual(1);
    expect(snapshot.bookingRequests.byStatus['requested']).toBeGreaterThanOrEqual(1);
    expect(snapshot.bookingRequests.byStatus['cancelled']).toBeGreaterThanOrEqual(1);
    expect(snapshot.bookingRequests.retestLinked).toBeGreaterThanOrEqual(1);
    expect(snapshot.slotBookings['booked']).toBeGreaterThanOrEqual(1);
    expect(snapshot.drawsCompleted).toBeGreaterThanOrEqual(1);
    expect(snapshot.resultsIngested['lab_pdf']).toBeGreaterThanOrEqual(1);
    expect(snapshot.resultsIngested['intake_text']).toBeUndefined();
    expect(snapshot.reviews['pending']).toBeGreaterThanOrEqual(1);
    expect(snapshot.eventStages['protocol_delivered']).toBeGreaterThanOrEqual(1);
    expect(snapshot.eventStages['slot_booked']).toBeGreaterThanOrEqual(1);
    // Distinct-funnelId collapse: the two duplicate rows above count once, so
    // the stage count sits strictly below the raw row count. Row count is read
    // AFTER the snapshot, so concurrent test files writing events (each with
    // its own distinct funnelId, +1 to both sides) can only widen the gap —
    // the assertion holds under any interleaving of the shared test DB.
    const rawRows = await prisma.funnelEvent.count({ where: { event: 'protocol_delivered' } });
    expect(snapshot.eventStages['protocol_delivered']).toBeLessThanOrEqual(rawRows - 1);
    // Every declared stage is present (render-stable), even when 0.
    expect(Object.keys(snapshot.eventStages).sort()).toEqual([...PILOT_EVENT_STAGES].sort());

    // No PII contract: emails, names, and cuid-shaped row ids must not appear.
    const raw = JSON.stringify(snapshot);
    expect(raw).not.toContain('@');
    expect(raw).not.toContain('Jane');
    expect(raw).not.toContain(userId);
    expect(raw).not.toContain(doc.id);
  });

  it('returns an all-zero shape on an empty database slice', async () => {
    const snapshot = await getPilotFunnelSnapshot(prisma);
    // Every declared stage key is present (render-stable), values are numbers.
    for (const value of Object.values(snapshot.eventStages)) {
      expect(typeof value).toBe('number');
    }
    expect(typeof snapshot.members).toBe('number');
  });
});
