import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { hashIp } from '@/lib/auth/ip-hash';
import { issueMagicLink } from '@/lib/auth/magic-link';
import { sendMagicLinkEmail } from '@/lib/auth/email';
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

function buildVerifyUrl(request: Request, rawToken: string): string {
  const base = resolveAppOrigin(request);
  return `${base}/api/auth/verify?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Resolve the origin to embed in the magic-link URL.
 *
 * Priority:
 *   1. `NEXT_PUBLIC_APP_URL` when explicitly configured (the env.ts default of
 *      `http://localhost:3000` is treated as "not set" — otherwise a missing
 *      Vercel config would silently email localhost links).
 *   2. On Vercel production: `VERCEL_PROJECT_PRODUCTION_URL` — the canonical
 *      aliased domain (e.g. `morning-form.vercel.app`), not the deployment-
 *      specific hash URL. `VERCEL_URL` on a prod deployment is the hash URL,
 *      which surfaces to users as an ugly `morning-form-<hash>-<team>.vercel.app`
 *      and looks like a preview.
 *   3. On Vercel preview: `VERCEL_BRANCH_URL` when available, else `VERCEL_URL`.
 *      The branch URL is a stable alias across redeploys of the same branch;
 *      the deployment hash URL shifts every push, so links emailed before the
 *      latest deploy would point at an older build.
 *   4. The incoming request's URL origin — local dev fallback.
 *
 * We intentionally don't trust `x-forwarded-host` even though Vercel's edge
 * proxy sets it: on a misconfigured runtime that forwards the client-supplied
 * header, an attacker could POST a magic-link request for a victim's email
 * with `x-forwarded-host: attacker.com`, the victim clicks the email, and
 * the token lands at attacker.com. The Vercel env vars above are server-side
 * and can't be spoofed by a client header.
 */
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

