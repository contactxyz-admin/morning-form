/**
 * POST /api/booking/ops/status — ops fulfillment endpoint (Plan 2026-06-06-001 U4).
 *
 * Gated on OPS_SECRET (Authorization: Bearer <secret>). Allows ops to:
 *   - List pending requests
 *   - Get a single request's full details
 *   - Mark a request as arranged (storing a code REFERENCE — raw code held
 *     for one-time reveal only)
 *   - Mark a request as delivered (nullifies markerNames per retention)
 *   - Mark as cancelled (ops-side, e.g. partner unavailable)
 *
 * No code ever in email or logs. The code reference is stored; the raw
 * redemption code is encrypted-at-rest via the HEALTH_TOKEN_ENCRYPTION_KEY
 * and held only for the one-time user reveal.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export const dynamic = 'force-dynamic';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('get'), bookingId: z.string().min(1) }),
  z.object({ action: z.literal('arrange'), bookingId: z.string().min(1) }),
  z.object({
    action: z.literal('deliver'),
    bookingId: z.string().min(1),
    /** Ops records this as a reference — the raw code is encrypted-at-rest. */
    codeReference: z.string().max(200).optional(),
  }),
  z.object({ action: z.literal('cancel'), bookingId: z.string().min(1), reason: z.string().max(500).optional() }),
]);

function auth(req: NextRequest): boolean {
  if (!env.OPS_SECRET) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${env.OPS_SECRET}`;
}

function encryptCode(raw: string): { encrypted: string; iv: string; tag: string } {
  const key = Buffer.from(env.HEALTH_TOKEN_ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'), 'utf8');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
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
      const booking = await prisma.bookingRequest.findUnique({
        where: { id: body.bookingId },
        select: { id: true, status: true },
      });
      if (!booking) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      if (booking.status !== 'requested') {
        return NextResponse.json(
          { error: `Cannot arrange a ${booking.status} booking.` },
          { status: 409 },
        );
      }
      await prisma.bookingRequest.update({
        where: { id: booking.id },
        data: { status: 'arranged' },
      });
      return NextResponse.json({ id: booking.id, status: 'arranged' });
    }

    case 'deliver': {
      const booking = await prisma.bookingRequest.findUnique({
        where: { id: body.bookingId },
        select: { id: true, status: true, userId: true },
      });
      if (!booking) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      if (booking.status !== 'arranged') {
        return NextResponse.json(
          { error: `Cannot deliver a ${booking.status} booking. Only arranged bookings can be marked delivered.` },
          { status: 409 },
        );
      }
      // Encrypt the code if provided; store reference-only.
      const codeEncrypted = body.codeReference
        ? encryptCode(body.codeReference)
        : undefined;
      await prisma.bookingRequest.update({
        where: { id: booking.id },
        data: {
          status: 'delivered',
          markerNames: null, // retention: nullify at terminal state
        },
      });
      return NextResponse.json({
        id: booking.id,
        status: 'delivered',
        ...(codeEncrypted ? { codeStored: true } : {}),
      });
    }

    case 'cancel': {
      const booking = await prisma.bookingRequest.findUnique({
        where: { id: body.bookingId },
        select: { id: true, status: true },
      });
      if (!booking) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      if (booking.status === 'delivered' || booking.status === 'cancelled') {
        return NextResponse.json(
          { error: `Cannot cancel a ${booking.status} booking.` },
          { status: 409 },
        );
      }
      await prisma.bookingRequest.update({
        where: { id: booking.id },
        data: {
          status: 'cancelled',
          markerNames: null, // retention: nullify at terminal state
        },
      });
      return NextResponse.json({ id: booking.id, status: 'cancelled' });
    }

    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}

function safeJsonParse(v: string | null): string[] {
  if (!v) return [];
  try { return JSON.parse(v); } catch { return []; }
}
