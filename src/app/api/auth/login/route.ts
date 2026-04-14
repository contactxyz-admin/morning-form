import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { setSessionCookie } from '@/lib/session';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'A valid email is required.' },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    // Set cookie before awaiting DB work — Next 14's cookies() mutation API is
    // tied to the current request's AsyncLocalStorage, which can be gone after
    // an await in some deployment modes.
    setSessionCookie(email);

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email },
      include: { assessment: true, stateProfile: true },
    });

    const onboarded = Boolean(user.assessment && user.stateProfile);
    const redirectTo = onboarded ? '/home' : '/assessment';

    return NextResponse.json({ redirectTo, email });
  } catch (error) {
    console.error('[API] Auth login error:', error);
    return NextResponse.json({ error: 'Failed to sign in' }, { status: 500 });
  }
}
