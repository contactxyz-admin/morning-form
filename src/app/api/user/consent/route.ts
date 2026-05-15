import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

/**
 * POST /api/user/consent — record LLM-consent acceptance for the current user.
 *
 * Idempotent: re-posting after acceptance is a no-op (the existing timestamp
 * is preserved, not overwritten — the *first* acceptance is the load-bearing
 * one for DPIA / audit purposes).
 *
 * Called by the client-side `<LlmConsentModal>` when the user clicks
 * "I accept" in response to a 412 from any LLM-bearing route.
 */
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
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
