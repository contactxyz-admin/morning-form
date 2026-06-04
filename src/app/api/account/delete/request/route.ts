import { NextResponse } from 'next/server';
import { randomBytes, createHmac } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { getSessionSecret, env } from '@/lib/env';
import { sendEmail } from '@/lib/auth/email';

/**
 * POST /api/account/delete/request — step 1 of the dual-factor account-deletion
 * flow (plan Unit 6).
 *
 * Requires an authenticated session AND a typed confirmation in the body
 * (`{ confirm: "DELETE" }`) so a stray POST can't start an irreversible flow.
 * Issues a single-use AccountDeletionToken (15 min, HMAC-hashed with a distinct
 * "account-deletion:" domain-separation prefix — mirrors hashToken in
 * src/lib/auth/magic-link.ts) bound to the session user, and emails a link to
 * the side-effect-free confirmation PAGE. Actual erasure runs only on the
 * confirm route's POST (token + active session). The emailed link lands on a
 * GET page that performs no mutation — email scanners fire GETs.
 */

const DELETION_TOKEN_TTL_MS = 15 * 60 * 1000;
const REQUIRED_CONFIRMATION = 'DELETE';

export function hashDeletionToken(raw: string): string {
  return createHmac('sha256', getSessionSecret()).update('account-deletion:').update(raw).digest('hex');
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  if (!json || typeof json !== 'object' || (json as { confirm?: unknown }).confirm !== REQUIRED_CONFIRMATION) {
    return NextResponse.json(
      { error: `Type "${REQUIRED_CONFIRMATION}" to confirm.` },
      { status: 400 },
    );
  }

  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashDeletionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DELETION_TOKEN_TTL_MS);
  await prisma.accountDeletionToken.create({
    data: { userId: user.id, tokenHash, createdAt: now, expiresAt },
  });

  const confirmUrl = `${resolveAppOrigin(request)}/account/delete/confirm?token=${encodeURIComponent(rawToken)}`;
  try {
    await sendEmail({
      to: user.email,
      subject: 'Confirm deletion of your MorningForm account',
      text: [
        'You requested permanent deletion of your MorningForm account.',
        'This is irreversible — all your data will be erased.',
        '',
        'Open the link below and confirm on the page. The link expires in 15 minutes.',
        '',
        confirmUrl,
        '',
        "If you didn't request this, ignore this email and your account stays intact.",
      ].join('\n'),
      html: `<p>You requested permanent deletion of your MorningForm account. This is <strong>irreversible</strong> — all your data will be erased.</p>
<p>Open the link below and confirm on the page. The link expires in 15 minutes.</p>
<p><a href="${confirmUrl}">${confirmUrl}</a></p>
<p style="color:#6b6b6b;font-size:13px">If you didn't request this, ignore this email and your account stays intact.</p>`,
    });
  } catch (error) {
    console.error('[API] Deletion confirmation email failed:', error);
    return NextResponse.json(
      { error: 'Could not send the confirmation email. Please try again.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

function resolveAppOrigin(request: Request): string {
  const configured = env.NEXT_PUBLIC_APP_URL;
  if (configured && configured !== 'http://localhost:3000') {
    return configured.replace(/\/$/, '');
  }
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (vercelEnv === 'preview') {
    const previewHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (previewHost) return `https://${previewHost}`;
  }
  return new URL(request.url).origin;
}
