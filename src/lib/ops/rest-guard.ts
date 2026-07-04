/**
 * Shared guard for every `/api/ops/*` REST handler: flag check (404) ->
 * getCurrentUser() (401) -> staff allowlist (403). Identical order to the
 * `DECISIONS_ENABLED` idiom in transition/route.ts, plus the ops allowlist.
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { isCompanyOpsEnabled, isStaff } from '@/lib/ops/config';

export interface OpsGuardOk {
  ok: true;
  user: { id: string; email: string };
}

export interface OpsGuardFail {
  ok: false;
  response: NextResponse;
}

export type OpsGuardResult = OpsGuardOk | OpsGuardFail;

export async function requireOpsStaff(): Promise<OpsGuardResult> {
  if (!isCompanyOpsEnabled()) {
    return { ok: false, response: NextResponse.json({ error: 'Not enabled.' }, { status: 404 }) };
  }
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }
  if (!isStaff(user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) };
  }
  return { ok: true, user: { id: user.id, email: user.email } };
}
