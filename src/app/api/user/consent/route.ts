import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { getCurrentUser } from '@/lib/session';

/**
 * POST /api/user/consent — record LLM-consent acceptance for the current user.
 *
 * Idempotent: re-posting after acceptance is a no-op (the existing timestamp
 * is preserved, not overwritten — the *first* acceptance is the load-bearing
 * one for DPIA / audit purposes). Returns 204 in both the "newly consented"
 * and "already consented" cases — callers cannot distinguish, and don't
 * need to.
 *
 * Called by the client-side `<LlmConsentModal>` when the user clicks
 * "I accept" in response to a 412 from any LLM-bearing route.
 *
 * Origin check: the session cookie is SameSite=Lax which already blocks
 * cross-site POSTs on modern browsers. This Origin-header guard is
 * defence-in-depth for older clients and explicit policy — consent
 * acceptance is a UX-critical decision that must originate from our own
 * UI, never from an attacker's page tricking the user into a top-level
 * navigation.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  if (origin && origin !== env.NEXT_PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // Only set the timestamp if it's currently null — preserves the
  // original acceptance moment across re-clicks.
  await prisma.user.updateMany({
    where: { id: user.id, llmConsentAcceptedAt: null },
    data: { llmConsentAcceptedAt: new Date() },
  });

  return new NextResponse(null, { status: 204 });
}
