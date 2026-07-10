/**
 * In-gym slot booking — env-backed config (pilot MVP plan 2026-07-04).
 */
import { env } from '@/lib/env';

export function isInGymBookingEnabled(): boolean {
  return env.IN_GYM_BOOKING_ENABLED === 'true';
}

/** Slot capacity bounds enforced at the staff create route. */
export const SLOT_CAPACITY_MIN = 1;
export const SLOT_CAPACITY_MAX = 50;

// Lives in ./format (dependency-free, client-importable); re-exported here
// for server callers that already import config.
export { PILOT_TIMEZONE } from './format';
