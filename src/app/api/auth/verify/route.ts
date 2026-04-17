import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { verifyMagicLink } from '@/lib/auth/magic-link';
import { createSession } from '@/lib/session';

/**
 * GET /api/auth/verify?token=<raw>
 *
 * Validates the magic-link token, marks it consumed, mints a session, then
 * redirects the user to `/home` (or `/assessment` if they haven't finished
 * onboarding). On any failure returns a small HTML page that nudges the user
 * to request a fresh link, avoiding existence leaks in the response.
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
    include: { assessment: true, stateProfile: true },
  });
  if (!user) {
    return new NextResponse(failurePage('invalid'), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  await createSession(user.id, {
    userAgent: request.headers.get('user-agent'),
    ipHash: null,
  });

  const onboarded = Boolean(user.assessment && user.stateProfile);
  const redirectTo = onboarded ? '/home' : '/assessment';
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return NextResponse.redirect(`${base}${redirectTo}`, { status: 303 });
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
