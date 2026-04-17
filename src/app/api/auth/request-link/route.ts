import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { env, getSessionSecret } from '@/lib/env';
import { issueMagicLink } from '@/lib/auth/magic-link';
import { sendMagicLinkEmail } from '@/lib/auth/email';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const DEMO_EMAIL = 'demo@morningform.com';

/**
 * POST /api/auth/request-link
 *
 * Always returns 200 with identical response shape for known/unknown emails
 * so response timing + body cannot be used to enumerate accounts. The only
 * non-200 outcomes are validation errors (400) and rate-limit violations
 * (429) — both independent of which email was supplied.
 *
 * Dev-only demo bypass: `demo@morningform.com` returns the raw token in the
 * JSON body ONLY when `ALLOW_DEMO_BYPASS=1` is explicitly set. NODE_ENV is
 * not a safe guard — Vercel preview builds run with NODE_ENV='production'
 * (good) but custom runtimes and CI can set it to anything. Requiring an
 * explicit opt-in env var makes the attack surface auditable: grep for
 * ALLOW_DEMO_BYPASS across every deployment config and confirm it's unset.
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }
  const { email } = parsed.data;
  const ipHash = hashIp(request);

  const result = await issueMagicLink(prisma, { email, requestIpHash: ipHash });
  if (result.outcome === 'rate_limited') {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a few minutes.' },
      { status: 429 },
    );
  }

  const verifyUrl = buildVerifyUrl(result.rawToken);

  try {
    await sendMagicLinkEmail({ to: email, verifyUrl });
  } catch (err) {
    console.error('[auth] magic-link email send failed:', err);
    // Do not leak the failure mode to the caller — still return 200 so a
    // transient email outage does not collapse into an enumeration signal.
  }

  // Dev demo bypass — return the raw token so automated flows can verify
  // without reaching into a mailbox. Gated on an explicit env flag, NOT on
  // NODE_ENV, so Vercel previews and misconfigured runtimes never leak it.
  if (env.ALLOW_DEMO_BYPASS === '1' && email === DEMO_EMAIL) {
    return NextResponse.json({ ok: true, devRawToken: result.rawToken, verifyUrl });
  }

  return NextResponse.json({ ok: true });
}

function buildVerifyUrl(rawToken: string): string {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return `${base}/api/auth/verify?token=${encodeURIComponent(rawToken)}`;
}

function hashIp(request: Request): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return createHash('sha256').update(getSessionSecret()).update(ip).digest('hex').slice(0, 32);
}
