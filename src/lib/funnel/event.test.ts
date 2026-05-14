import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import {
  FUNNEL_EVENTS,
  MAX_PROPERTIES_BYTES,
  isPlausibleFunnelId,
  writeFunnelEvent,
} from './event';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

const VALID_ID = 'a-valid-funnel-id-with-32-chars-12';

describe('isPlausibleFunnelId', () => {
  it('accepts UUID-like ids and similar', () => {
    expect(isPlausibleFunnelId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isPlausibleFunnelId('abcd1234')).toBe(true);
    expect(isPlausibleFunnelId('f-' + 'a'.repeat(40))).toBe(true);
  });

  it('rejects empty, too-short, too-long, or junk strings', () => {
    expect(isPlausibleFunnelId('')).toBe(false);
    expect(isPlausibleFunnelId('short')).toBe(false);
    expect(isPlausibleFunnelId('a'.repeat(65))).toBe(false);
    expect(isPlausibleFunnelId('has spaces in it abc')).toBe(false);
    expect(isPlausibleFunnelId('has\nnewline12345')).toBe(false);
    expect(isPlausibleFunnelId(null)).toBe(false);
    expect(isPlausibleFunnelId(undefined)).toBe(false);
    expect(isPlausibleFunnelId(123)).toBe(false);
  });
});

describe('writeFunnelEvent', () => {
  it('writes a row with all fields populated', async () => {
    await writeFunnelEvent(prisma, {
      funnelId: VALID_ID,
      userId: null,
      event: FUNNEL_EVENTS.LANDING_VIEWED,
      path: '/us',
      properties: { market: 'us' },
    });

    const rows = await prisma.funnelEvent.findMany({
      where: { funnelId: VALID_ID, event: FUNNEL_EVENTS.LANDING_VIEWED },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('landing_viewed');
    expect(rows[0].path).toBe('/us');
    expect(rows[0].properties).toEqual({ market: 'us' });
    expect(rows[0].userId).toBeNull();
  });

  it('silently drops events with implausible funnel ids', async () => {
    await writeFunnelEvent(prisma, {
      funnelId: 'too short',
      event: FUNNEL_EVENTS.LANDING_VIEWED,
    });
    const rows = await prisma.funnelEvent.findMany({
      where: { event: 'landing_viewed', funnelId: 'too short' },
    });
    expect(rows).toHaveLength(0);
  });

  it('silently drops events with empty or too-long event names', async () => {
    const id1 = 'id-empty-event-12345678';
    const id2 = 'id-long-event-12345678ab';
    await writeFunnelEvent(prisma, { funnelId: id1, event: '' });
    await writeFunnelEvent(prisma, { funnelId: id2, event: 'a'.repeat(81) });

    const rows = await prisma.funnelEvent.findMany({
      where: { funnelId: { in: [id1, id2] } },
    });
    expect(rows).toHaveLength(0);
  });

  it('drops properties exceeding the size cap but still writes the event', async () => {
    const id = 'id-oversize-props-1234567';
    const oversize = { blob: 'x'.repeat(MAX_PROPERTIES_BYTES + 100) };
    await writeFunnelEvent(prisma, {
      funnelId: id,
      event: FUNNEL_EVENTS.ASSESSMENT_COMPLETED,
      properties: oversize,
    });

    const rows = await prisma.funnelEvent.findMany({ where: { funnelId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].properties).toBeNull();
  });

  it('does not propagate write errors to the caller', async () => {
    const badDb = {
      funnelEvent: {
        create: vi.fn().mockRejectedValue(new Error('connection refused')),
      },
    } as unknown as PrismaClient;

    // Should not throw — analytics must NEVER break the funnel it measures.
    await expect(
      writeFunnelEvent(badDb, {
        funnelId: VALID_ID,
        event: FUNNEL_EVENTS.LANDING_VIEWED,
      }),
    ).resolves.toBeUndefined();
  });
});
