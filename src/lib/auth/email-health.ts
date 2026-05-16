/**
 * Observability helper for magic-link email delivery failures.
 *
 * Wires Resend error classes into the shared diagnostic counter table so
 * config drift (bad API key, rate-limit spikes) surfaces within minutes via
 * the `auth-magic-link-*` counter family rather than hiding silently in the
 * anti-enumeration 200 response.
 *
 * Counter keys (kebab-case, queryable per error class):
 *   auth-magic-link-resend-auth-error      — 401/403 from Resend (bad/rotated key)
 *   auth-magic-link-resend-transient-error — 5xx / network errors from Resend
 *   auth-magic-link-send-unknown-error     — anything else thrown by sendMagicLinkEmail
 *
 * The function is intentionally fire-and-forget: it never throws. A secondary
 * DB failure while recording a send failure must not change the 200 response
 * shape that the anti-enumeration design depends on.
 */

import { ResendAuthError, ResendTransientError } from '@/lib/auth/email';
import { incrementDiagnostic } from '@/lib/marketing/diagnostic';

export const COUNTER_KEYS = {
  resendAuth: 'auth-magic-link-resend-auth-error',
  resendTransient: 'auth-magic-link-resend-transient-error',
  unknown: 'auth-magic-link-send-unknown-error',
} as const;

/**
 * Classify `err` and increment the corresponding daily diagnostic counter.
 * Safe to await or fire-and-forget — never throws.
 */
export async function recordEmailSendFailure(err: unknown): Promise<void> {
  const key =
    err instanceof ResendAuthError
      ? COUNTER_KEYS.resendAuth
      : err instanceof ResendTransientError
        ? COUNTER_KEYS.resendTransient
        : COUNTER_KEYS.unknown;

  try {
    await incrementDiagnostic(key);
  } catch {
    // Secondary DB failure — swallow so the caller's response shape is unaffected.
  }
}
