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

/** The pilot is UK-only; slot times render in this zone on every surface. */
export const PILOT_TIMEZONE = 'Europe/London';
