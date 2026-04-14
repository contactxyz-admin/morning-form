import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getOrCreateDemoUser } from '@/lib/demo-user';

// TODO(auth): This is a dev-grade sign-in. Replace with real auth
// (password / magic link / OAuth) before shipping to anything beyond demo.
// The `getCurrentUser()` seam is the one to swap; call sites should keep working.

export const SESSION_COOKIE = 'mf_session_email';
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export async function getCurrentUser() {
  const email = cookies().get(SESSION_COOKIE)?.value;

  if (!email) {
    return getOrCreateDemoUser();
  }

  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
    include: { assessment: true, stateProfile: true },
  });
}

export function setSessionCookie(email: string) {
  cookies().set(SESSION_COOKIE, email, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: THIRTY_DAYS_SECONDS,
  });
}

export function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}
