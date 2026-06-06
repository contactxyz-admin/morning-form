/**
 * POST /api/booking/ops/status — ops fulfillment endpoint (Plan 2026-06-06-001 U4).
 *
 * Gated on OPS_SECRET (Authorization: Bearer <secret>), compared in constant
 * time. Allows ops to:
 *   - List pending requests
 *   - Get a single request's full details
 *   - Mark a request as arranged
 *   - Mark a request as delivered (stores the ENCRYPTED redemption code for the
 *     user's one-time in-app reveal; nullifies markerNames per retention)
 *   - Mark as cancelled (ops-side, e.g. partner unavailable)
 *
 * The redemption code is encrypted at rest via src/lib/health/crypto.ts and is
 * NEVER in email or logs — the user reveals it once behind their own session.
 *
 * State transitions are conditional (updateMany WHERE id AND status='<expected>')
 * so a concurrent cancel-vs-arrange race resolves to a 409 for the loser rather
 * than silently clobbering.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { encryptToken } from '@/lib/health/crypto';

export const dynamic = 'force-dynamic';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('get'), bookingId: z.string().min(1) }),
  z.object({ action: z.literal('arrange'), bookingId: z.string().min(1) }),
  z.object({
    action: z.literal('deliver'),
    bookingId: z.string().min(1),
    /** The redemption code — encrypted at rest, revealed once to the user. */
    codeReference: z.string().min(1).max(200),
  }),
  z.object({ action: z.literal('cancel'), bookingId: z.string().min(1), reason: z.string().max(500).optional() }),
]);

function auth(req: NextRequest): boolean {
  if (!env.OPS_SECRET) return false;
  const header = req.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${env.OPS_SECRET}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  let body: z.infer<typeof ActionSchema>;
  try {
    body = ActionSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  switch (body.action) {
    case 'list': {
      const rows = await prisma.bookingRequest.findMany({
        where: { status: { in: ['requested', 'arranged'] } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, market: true, status: true, createdAt: true },
      });
      return NextResponse.json({ rows });
    }

    case 'get': {
      const row = await prisma.bookingRequest.findUnique({
        where: { id: body.bookingId },
      });
      if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      return NextResponse.json({
        id: row.id,
        userId: row.userId,
        markerNames: safeJsonParse(row.markerNames),
        market: row.market,
        status: row.status,
        actionId: row.actionId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }

    case 'arrange': {
      // Conditional transition: only `requested` → `arranged`. Concurrency-safe.
      const result = await prisma.bookingRequest.updateMany({
        where: { id: body.bookingId, status: 'requested' },
        data: { status: 'arranged' },
      });
      if (result.count === 0) {
        return await conflictOrNotFound(body.bookingId, 'arrange');
      }
      return NextResponse.json({ id: body.bookingId, status: 'arranged' });
    }

    case 'deliver': {
      // Encrypt the redemption code via the codebase-standard crypto helper.
      const codeEncrypted = encryptToken(body.codeReference);
      // Conditional transition: only `arranged` → `delivered`.
      const result = await prisma.bookingRequest.updateMany({
        where: { id: body.bookingId, status: 'arranged' },
        data: {
          status: 'delivered',
          codeEncrypted, // stored for the user's one-time in-app reveal
          markerNames: null, // retention: nullify at terminal state
        },
      });
      if (result.count === 0) {
        return await conflictOrNotFound(body.bookingId, 'deliver');
      }
      return NextResponse.json({ id: body.bookingId, status: 'delivered', codeStored: true });
    }

    case 'cancel': {
      // Conditional transition: only `requested`/`arranged` → `cancelled`.
      const result = await prisma.bookingRequest.updateMany({
        where: { id: body.bookingId, status: { in: ['requested', 'arranged'] } },
        data: {
          status: 'cancelled',
          markerNames: null, // retention: nullify at terminal state
        },
      });
      if (result.count === 0) {
        return await conflictOrNotFound(body.bookingId, 'cancel');
      }
      return NextResponse.json({ id: body.bookingId, status: 'cancelled' });
    }

    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}

/**
 * When a conditional transition affected zero rows, distinguish a missing
 * booking (404) from an invalid/stale transition (409).
 */
async function conflictOrNotFound(bookingId: string, action: string): Promise<Response> {
  const row = await prisma.bookingRequest.findUnique({
    where: { id: bookingId },
    select: { status: true },
  });
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(
    { error: `Cannot ${action} a ${row.status} booking.` },
    { status: 409 },
  );
}

function safeJsonParse(v: string | null): string[] {
  if (!v) return [];
  try { return JSON.parse(v); } catch { return []; }
}
