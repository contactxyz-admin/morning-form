/**
 * Clinician review — env-backed config (pilot MVP plan 2026-07-04).
 *
 * The clinician "role" is magic-link sign-in + membership in
 * CLINICIAN_ALLOWLIST, mirroring the founder staff allowlist in
 * src/lib/ops/config.ts. Reads go through `env`, never bare process.env;
 * parsing fails closed (malformed env → nobody is a clinician).
 */
import { env } from '@/lib/env';

export function isClinicianReviewEnabled(): boolean {
  return env.CLINICIAN_REVIEW_ENABLED === 'true';
}

export function clinicianAllowlist(): string[] {
  return env.CLINICIAN_ALLOWLIST.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isClinician(email: string | null | undefined): boolean {
  if (!email) return false;
  return clinicianAllowlist().includes(email.toLowerCase());
}
