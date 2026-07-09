/**
 * Shared guard for every clinician-facing REST handler: flag check (404) ->
 * getCurrentUser() (401) -> clinician allowlist (403). Same order as the
 * ops rest-guard (src/lib/ops/rest-guard.ts) it mirrors.
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { isClinicianReviewEnabled, isClinician } from '@/lib/review/config';

export interface ClinicianGuardOk {
  ok: true;
  clinician: { id: string; email: string };
}

export interface ClinicianGuardFail {
  ok: false;
  response: NextResponse;
}

export type ClinicianGuardResult = ClinicianGuardOk | ClinicianGuardFail;

export async function requireClinician(): Promise<ClinicianGuardResult> {
  if (!isClinicianReviewEnabled()) {
    return { ok: false, response: NextResponse.json({ error: 'Not enabled.' }, { status: 404 }) };
  }
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }
  if (!isClinician(user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) };
  }
  return { ok: true, clinician: { id: user.id, email: user.email } };
}
