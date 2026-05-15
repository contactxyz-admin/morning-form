import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyMagicLink } from '@/lib/auth/magic-link';
import { createSession } from '@/lib/session';
import { ANONYMOUS_COOKIE } from '@/lib/marketing/constants';

/**
 * GET /api/auth/verify?token=<raw>
 *
 * Validates the magic-link token, marks it consumed, mints a session, then
 * 303-redirects the user. On any failure returns a small HTML page that
 * nudges the user to request a fresh link, avoiding existence leaks in
 * the response.
 *
 * Redirect contract (post-2026-05-15):
 *   - First-ever session (signup):    303 /record?signed_in=1&new=1
 *   - Returning sign-in (Nth):        303 /record?signed_in=1
 *
 * The destination is unconditional `/record` — the pre-2026-05 fork that
 * routed un-assessed users to `/assessment` was removed when the
 * assessment became optional personalisation. Callers that previously
 * inferred onboarding state from the Location header should now read
 * `GET /api/assessment` (returns 404 for no assessment).
 *
 * The `&new=1` flag is consumed by `<SignedInTracker>` to fire
 * `signup_completed` exactly once. `?signed_in=1` always fires
 * `sign_in_completed`. Both params are stripped on first paint.
 *
 * Failure codes: 404 (invalid/unknown token), 410 (expired/consumed token).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';

  const result = await verifyMagicLink(prisma, { rawToken: token });
  if (!result.ok) {
    const status = result.reason === 'invalid' ? 404 : 410;
    return new NextResponse(
      failurePage(result.reason),
      { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: result.userId },
  });
  if (!user) {
    return new NextResponse(failurePage('invalid'), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // Count existing sessions BEFORE creating the new one — zero existing
  // sessions means this is the user's first sign-in (signup), versus
  // N+1th sign-in (return). The flag is forwarded via ?new=1 so the
  // client-side SignedInTracker can fire `signup_completed` exactly once.
  //
  // Race bound: COUNT + INSERT here is not atomic at the DB level. The
  // primary serialization point is `verifyMagicLink`'s atomic
  // updateMany WHERE consumedAt IS NULL — each token consumes exactly
  // once, so a single magic link can only reach this point once. A user
  // would have to obtain TWO valid (un-expired, un-consumed) tokens AND
  // verify them concurrently (~ms apart) to double-fire SIGNUP_COMPLETED.
  // Acceptable for analytics; if multi-link signups become common, dedup
  // FunnelEvent at the consumer side on (userId, eventName).
  const priorSessionCount = await prisma.session.count({
    where: { userId: user.id },
  });
  const isFirstSession = priorSessionCount === 0;

  await createSession(user.id, {
    userAgent: request.headers.get('user-agent'),
    ipHash: null,
  });

  // R7 funnel attribution: backfill LandingPageVisit.email for the
  // visitor's pre-signup pageviews so the activation-funnel resolver can
  // join anchor-page-visit -> User by email. Best-effort — a missing
  // cookie or zero matching rows is normal (organic homepage signups).
  const anonymousId =
    request.headers
      .get('cookie')
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${ANONYMOUS_COOKIE}=`))
      ?.split('=')[1] ?? null;
  if (anonymousId) {
    await prisma.landingPageVisit.updateMany({
      where: { mfAnonymousId: anonymousId, email: null },
      data: { email: user.email },
    });
  }

  // All signed-in users land on /record regardless of assessment state.
  // The pre-2026-05 forked logic redirected un-assessed users into /assessment
  // as a forced onboarding gate — that gate is removed in this plan
  // (docs/plans/2026-05-15-002-feat-lead-gen-signup-and-optional-assessment-plan.md).
  // /record renders cleanly for empty graphs via <GraphListEmpty />, and the
  // home/record surfaces carry a "Personalise your record" CTA pointing
  // back to /assessment for users who choose to take it.
  // `?signed_in=1` is a one-shot flag the destination page reads on mount
  // to fire the sign_in_completed funnel event, then strips via
  // history.replaceState. `&new=1` additionally fires signup_completed
  // when this is the user's first session ever (i.e. they just signed
  // up vs returning).
  const redirectTo = isFirstSession ? '/record?signed_in=1&new=1' : '/record?signed_in=1';
  // Redirect relative to the inbound request so the user stays on the same
  // host they clicked the magic link from (preview subdomain vs prod).
  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
}

function failurePage(reason: 'invalid' | 'expired' | 'consumed'): string {
  const heading =
    reason === 'expired'
      ? 'Link expired'
      : reason === 'consumed'
        ? 'Link already used'
        : 'Link not valid';
  const body =
    reason === 'invalid'
      ? 'This sign-in link could not be verified. Request a fresh one from the sign-in page.'
      : reason === 'expired'
        ? 'Sign-in links expire after 15 minutes. Request a fresh one from the sign-in page.'
        : 'This sign-in link has already been used. Request a fresh one from the sign-in page.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${heading}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:12vh auto;padding:0 1.5rem;color:#111}h1{font-weight:300;font-size:2rem;letter-spacing:-0.02em}p{color:#555;line-height:1.5}a{color:#111}</style></head>
<body><h1>${heading}</h1><p>${body}</p><p><a href="/sign-in">Back to sign in</a></p></body></html>`;
}
