import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { hashIp } from '@/lib/auth/ip-hash';
import { issueMagicLink } from '@/lib/auth/magic-link';
import { sendMagicLinkEmail } from '@/lib/auth/email';
import { recordEmailSendFailure } from '@/lib/auth/email-health';
import { resolveAppOrigin } from '@/lib/urls';
import { COHORT_KEYS } from '@/lib/marketing/cohorts';
import { MARKETS } from '@/lib/marketing/constants';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Phase 0 SEO/GEO funnel attribution: optional context captured when the
  // visitor submits email from a marketing page. Persisted on User row at
  // FIRST CREATION ONLY — never overwrites an existing user's signup
  // context, so a returning visitor on a different cohort does not
  // re-attribute the original signup.
  signupContext: z
    .object({
      market: z.enum(MARKETS),
      cohort: z.enum(COHORT_KEYS),
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    })
    .optional(),
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
  const { email, signupContext } = parsed.data;
  const ipHash = hashIp(request);

  const result = await issueMagicLink(prisma, {
    email,
    requestIpHash: ipHash,
    signupContext,
  });
  if (result.outcome === 'rate_limited') {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a few minutes.' },
      { status: 429 },
    );
  }

  const verifyUrl = buildVerifyUrl(request, result.rawToken);

  try {
    await sendMagicLinkEmail({ to: email, verifyUrl });
  } catch (err) {
    console.error('[auth] magic-link email send failed:', err);
    // Record a per-error-class diagnostic counter so config drift (bad key,
    // rate-limit spikes) surfaces to operators within minutes. Fire-and-forget:
    // a secondary DB failure must not change the 200 response shape.
    void recordEmailSendFailure(err);
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

// Resolve the origin to embed in the magic-link URL via the shared
// resolveAppOrigin (@/lib/urls) — the single place the env/Vercel/request
// fallback chain (and the production host-poisoning guard) lives. The shared
// helper intentionally does NOT trust x-forwarded-host: an attacker who can
// forward that header on a misconfigured runtime could otherwise land a
// victim's magic-link token at attacker.com.
function buildVerifyUrl(request: Request, rawToken: string): string {
  const base = resolveAppOrigin(request);
  return `${base}/api/auth/verify?token=${encodeURIComponent(rawToken)}`;
}

