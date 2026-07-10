/**
 * Constant-time bearer-token check shared by the secret-gated ops/cron
 * routes (retest-nudge, ops-digest, booking ops status). One implementation
 * so a hardening fix can't apply to one endpoint and miss the others.
 * A missing/empty secret fails closed — every request is rejected.
 */
import { timingSafeEqual } from 'node:crypto';

export function bearerAuthorized(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
