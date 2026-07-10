/**
 * Slot time rendering for the in-gym pilot — the ONE place that knows the
 * pilot's display timezone and formats.
 *
 * Deliberately dependency-free (no env, no server imports) so both client
 * components (/book, /book/manage) and server modules (booking-email) can
 * share it; PILOT_TIMEZONE is re-exported from ./config for server callers
 * that already import config.
 */

/** The pilot is UK-only; slot times render in this zone on every surface. */
export const PILOT_TIMEZONE = 'Europe/London';

/** Long form for emails/cards: "Monday, 20 July, 13:00". */
export function formatSlotTime(startsAt: Date): string {
  return startsAt.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PILOT_TIMEZONE,
  });
}

/** Time-of-day chip label: "13:00". */
export function formatSlotTimeOfDay(startsAt: Date): string {
  return startsAt.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PILOT_TIMEZONE,
  });
}

/** Day group header: "Monday 20 July". */
export function formatSlotDay(startsAt: Date): string {
  return startsAt.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: PILOT_TIMEZONE,
  });
}

/** Dense staff-table form: "Mon 20 Jul, 13:00". */
export function formatSlotShort(startsAt: Date): string {
  return startsAt.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PILOT_TIMEZONE,
  });
}
