/**
 * Server-side write surface for activation funnel events.
 *
 * Counterpart to `src/lib/funnel/track.ts` (client-side helper). Route
 * handlers and server actions call this directly when they fire from
 * server context (e.g. magic-link consumption); the client helper
 * routes through `/api/events`.
 *
 * Fire-and-forget. The caller never awaits — analytics failure must
 * NEVER propagate into the user flow it's measuring. Errors are
 * logged to stderr and swallowed.
 */
import type { PrismaClient } from '@prisma/client';

export const FUNNEL_EVENTS = {
  LANDING_VIEWED: 'landing_viewed',
  // Signup events (2026-05-15 lead-gen pivot): SIGNUP_INITIATED fires
  // when the user submits the email form (or clicks an SSO button in
  // Phase B). SIGNUP_COMPLETED fires once, on the user's first session
  // ever — distinct from SIGN_IN_COMPLETED which fires on every fresh
  // sign-in (returning users included).
  SIGNUP_INITIATED: 'signup_initiated',
  SIGNUP_COMPLETED: 'signup_completed',
  // Assessment events. Post-2026-05-15 these fire from the OPTIONAL
  // personalisation flow; they are no longer core funnel gates.
  // ASSESSMENT_OFFERED fires when the "Personalise your record" CTA
  // renders on /home for an un-assessed user.
  ASSESSMENT_OFFERED: 'assessment_offered',
  ASSESSMENT_STARTED: 'assessment_started',
  ASSESSMENT_COMPLETED: 'assessment_completed',
  REVEAL_VIEWED: 'reveal_viewed',
  SIGN_IN_COMPLETED: 'sign_in_completed',
  FIRST_ASK_SENT: 'first_ask_sent',
} as const;

/**
 * Auth provider vocabulary used in the `provider` property of
 * SIGNUP_INITIATED / SIGNUP_COMPLETED events. Pin the union here so
 * Phase B SSO additions can't introduce typos ('Google' vs 'google',
 * 'oauth_google', etc.) that break analytics queries keyed on this
 * property.
 */
export type AuthProvider = 'magic_link' | 'google' | 'apple';

export type FunnelEventName = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

/**
 * Property bag cap. Keep this small — event properties are intent
 * metadata (durationMs, questionCount, market), not data dumps.
 * Larger payloads belong in their own table.
 */
export const MAX_PROPERTIES_BYTES = 2 * 1024;

export interface WriteFunnelEventInput {
  funnelId: string;
  userId?: string | null;
  event: FunnelEventName | string;
  path?: string | null;
  properties?: unknown;
}

/**
 * Stable-id format guard. `funnelId` lives in localStorage as a UUID
 * generated client-side, but we don't fully trust it on the way in.
 * Reject anything that isn't a plausible identifier (length 8-64, no
 * whitespace or control chars) so an attacker can't pollute the index
 * with multi-MB strings.
 */
export function isPlausibleFunnelId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length >= 8 &&
    id.length <= 64 &&
    /^[A-Za-z0-9_-]+$/.test(id)
  );
}

export async function writeFunnelEvent(
  db: PrismaClient,
  input: WriteFunnelEventInput,
): Promise<void> {
  try {
    if (!isPlausibleFunnelId(input.funnelId)) return;
    if (typeof input.event !== 'string' || input.event.length === 0 || input.event.length > 80) {
      return;
    }

    // Cap properties size at write time so a malicious client can't
    // grow this table linearly with input volume.
    let propertiesSafe: unknown = null;
    if (input.properties !== undefined && input.properties !== null) {
      try {
        const raw = JSON.stringify(input.properties);
        if (raw.length <= MAX_PROPERTIES_BYTES) propertiesSafe = input.properties;
      } catch {
        propertiesSafe = null;
      }
    }

    await db.funnelEvent.create({
      data: {
        funnelId: input.funnelId,
        userId: input.userId ?? null,
        event: input.event,
        path: input.path ?? null,
        properties: propertiesSafe as never,
      },
    });
  } catch (err) {
    // Never propagate analytics failures into the funnel they're
    // measuring. Best-effort write; stderr log only.
    if (process.env.NODE_ENV !== 'test') {
      process.stderr.write(
        `[funnel] write failed (event=${input.event}): ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}
