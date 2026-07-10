/**
 * Guards for the pilot booking surfaces.
 *
 * requirePilotMember: flag (404) -> session (401) — any signed-in member may
 * view/book slots. requirePilotStaff: additionally requires the founder
 * staff allowlist (COMPANY_OPS_ALLOWLIST via src/lib/ops/config.ts — isStaff
 * does not depend on the ops board's own flag) for slot management.
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { isStaff } from '@/lib/ops/config';
import { isInGymBookingEnabled } from './config';

export interface PilotGuardOk {
  ok: true;
  user: { id: string; email: string };
}

export interface PilotGuardFail {
  ok: false;
  response: NextResponse;
}

export type PilotGuardResult = PilotGuardOk | PilotGuardFail;

export async function requirePilotMember(): Promise<PilotGuardResult> {
  if (!isInGymBookingEnabled()) {
    return { ok: false, response: NextResponse.json({ error: 'Not enabled.' }, { status: 404 }) };
  }
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }
  return { ok: true, user: { id: user.id, email: user.email } };
}

export async function requirePilotStaff(): Promise<PilotGuardResult> {
  const member = await requirePilotMember();
  if (!member.ok) return member;
  if (!isStaff(member.user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) };
  }
  return member;
}
