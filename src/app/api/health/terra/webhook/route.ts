import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { captureRawPayload } from '@/lib/health/raw-payload';
import { incrementDiagnostic } from '@/lib/marketing/diagnostic';

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

interface TerraWebhookEvent {
  type: string | null;
  status: string | null;
  provider: string;
  resource: string | null;
  terraUserId: string | null;
  referenceId: string | null;
  scopes: unknown;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const webhookSecret = process.env.TERRA_WEBHOOK_SECRET;

  if (webhookSecret) {
    const signatureResult = verifyTerraSignature(rawBody, request.headers, webhookSecret);
    if (!signatureResult.ok) {
      await incrementDiagnostic(`terra-webhook-${signatureResult.reason}`);
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await incrementDiagnostic('terra-webhook-malformed-json');
    return NextResponse.json({ error: 'Malformed webhook payload' }, { status: 400 });
  }

  const event = extractTerraWebhookEvent(payload);
  await captureRawPayload({
    userId: event.referenceId ?? event.terraUserId ?? 'terra-unknown',
    provider: event.provider,
    source: 'push',
    payload,
  });

  if (event.provider !== 'garmin') {
    return NextResponse.json({ received: true, processed: false });
  }

  const type = event.type?.toLowerCase() ?? null;
  const status = event.status?.toLowerCase() ?? null;

  if (type === 'auth' && status !== 'failure' && status !== 'failed') {
    return processGarminAuthSuccess(event);
  }

  if (
    type === 'deauth'
    || type === 'deauthorization'
    || type === 'revoked'
    || status === 'revoked'
    || status === 'deauth'
  ) {
    return processGarminDeauth(event);
  }

  if (type === 'auth' && (status === 'failure' || status === 'failed')) {
    return processGarminAuthFailure(event);
  }

  return NextResponse.json({ received: true, processed: false });
}

function verifyTerraSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): { ok: true } | { ok: false; reason: string } {
  const signatureHeader = headers.get('terra-signature');
  if (!signatureHeader) return { ok: false, reason: 'missing-signature' };

  const signature = signatureFromHeader(signatureHeader);
  const timestamp = timestampFromHeader(signatureHeader, headers.get('terra-timestamp'));
  if (!signature || !timestamp) return { ok: false, reason: 'malformed-signature' };

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale-signature' };
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return timingSafeHexEqual(signature, expected)
    ? { ok: true }
    : { ok: false, reason: 'invalid-signature' };
}

function signatureFromHeader(header: string): string | null {
  const fields = parseSignatureFields(header);
  const signature = fields.v1 ?? fields.signature ?? (header.includes('=') ? null : header);
  if (!signature) return null;
  return signature.replace(/^sha256=/, '').trim();
}

function timestampFromHeader(signatureHeader: string, timestampHeader: string | null): number | null {
  const fields = parseSignatureFields(signatureHeader);
  const rawTimestamp = fields.t ?? fields.timestamp ?? timestampHeader;
  if (!rawTimestamp) return null;
  const timestamp = Number(rawTimestamp);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseSignatureFields(header: string): Record<string, string> {
  return header.split(',').reduce<Record<string, string>>((fields, part) => {
    const [key, value] = part.split('=');
    if (key && value) fields[key.trim()] = value.trim();
    return fields;
  }, {});
}

function timingSafeHexEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

async function processGarminAuthSuccess(event: TerraWebhookEvent) {
  if (!event.referenceId || !event.terraUserId) {
    await incrementDiagnostic('terra-webhook-malformed-auth');
    return NextResponse.json({ received: true, processed: false }, { status: 202 });
  }

  const user = await prisma.user.findUnique({
    where: { id: event.referenceId },
    select: { id: true },
  });
  if (!user) {
    await incrementDiagnostic('terra-webhook-unmatched-user');
    return NextResponse.json({ received: true, processed: false }, { status: 202 });
  }

  const metadata = JSON.stringify({
    mode: 'terra',
    eventType: event.type,
    eventStatus: event.status,
    provider: 'garmin',
    resource: event.resource ?? 'GARMIN',
    scopes: event.scopes ?? null,
    connectedAt: new Date().toISOString(),
  });

  await prisma.healthConnection.upsert({
    where: { userId_provider: { userId: event.referenceId, provider: 'garmin' } },
    update: {
      status: 'connected',
      terraUserId: event.terraUserId,
      metadata,
    },
    create: {
      userId: event.referenceId,
      provider: 'garmin',
      status: 'connected',
      terraUserId: event.terraUserId,
      metadata,
    },
  });

  return NextResponse.json({ received: true, processed: true });
}

async function processGarminDeauth(event: TerraWebhookEvent) {
  const where = garminConnectionWhere(event);
  if (!where) {
    await incrementDiagnostic('terra-webhook-missing-identifier');
    return NextResponse.json({ received: true, processed: false }, { status: 202 });
  }

  const metadata = JSON.stringify({
    mode: 'terra',
    eventType: event.type,
    eventStatus: event.status,
    provider: 'garmin',
    resource: event.resource ?? 'GARMIN',
    disconnectedAt: new Date().toISOString(),
  });

  await prisma.healthConnection.updateMany({
    where,
    data: {
      status: 'disconnected',
      terraUserId: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      metadata,
    },
  });

  return NextResponse.json({ received: true, processed: true });
}

async function processGarminAuthFailure(event: TerraWebhookEvent) {
  const where = garminConnectionWhere(event);
  if (!where) {
    await incrementDiagnostic('terra-webhook-missing-identifier');
    return NextResponse.json({ received: true, processed: false }, { status: 202 });
  }

  const metadata = JSON.stringify({
    mode: 'terra',
    eventType: event.type,
    eventStatus: event.status,
    provider: 'garmin',
    resource: event.resource ?? 'GARMIN',
    syncError: 'terra_auth_failed',
    lastSyncFailedAt: new Date().toISOString(),
  });

  await prisma.healthConnection.updateMany({
    where,
    data: {
      status: 'error',
      metadata,
    },
  });

  return NextResponse.json({ received: true, processed: true });
}

function garminConnectionWhere(event: TerraWebhookEvent) {
  if (event.referenceId) {
    return { userId: event.referenceId, provider: 'garmin' as const };
  }
  if (event.terraUserId) {
    return { terraUserId: event.terraUserId, provider: 'garmin' as const };
  }
  return null;
}

function extractTerraWebhookEvent(payload: unknown): TerraWebhookEvent {
  const row = asRecord(payload);
  const user = asRecord(row.user);
  const data = asRecord(row.data);
  const dataUser = asRecord(data.user);

  const resource = normalizeProvider(firstString(
    row.resource,
    row.provider,
    row.data_provider,
    user.provider,
    dataUser.provider,
  ));

  return {
    type: firstString(row.type, row.event_type, row.eventType, row.event),
    status: firstString(row.status, row.auth_status, row.event_status, user.status),
    provider: (resource ?? 'terra').toLowerCase(),
    resource,
    terraUserId: firstString(
      row.user_id,
      row.terra_user_id,
      row.userId,
      user.user_id,
      user.userId,
      dataUser.user_id,
      dataUser.userId,
    ),
    referenceId: firstString(
      row.reference_id,
      row.referenceId,
      user.reference_id,
      user.referenceId,
      dataUser.reference_id,
      dataUser.referenceId,
    ),
    scopes: user.scopes ?? dataUser.scopes ?? row.scopes ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function normalizeProvider(provider: string | null): string | null {
  if (!provider) return null;
  return provider.trim().toUpperCase();
}
