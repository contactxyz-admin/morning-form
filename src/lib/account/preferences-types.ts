/**
 * Leaf module for the user-preferences shape + defaults. No heavy imports
 * (no prisma, no @vercel/blob) so both the server route
 * (src/app/api/user/preferences/route.ts) and the client Settings page can
 * import the same single source of truth without bundling server runtime.
 *
 * Kept in sync with the UserPreferences model defaults (prisma/schema.prisma).
 */

// Server-backed preference fields (mirror of the UserPreferences model /
// /api/user/preferences allowlist). Notification toggles use the model's
// notify* names; the UI labels them morning/protocol/evening/weekly.
export type Preferences = {
  wakeTime: string;
  windDownTime: string;
  timezone: string;
  notifyMorning: boolean;
  notifyProtocol: boolean;
  notifyEvening: boolean;
  notifyWeekly: boolean;
};

export const PREF_DEFAULTS: Preferences = {
  wakeTime: '07:00',
  windDownTime: '22:00',
  timezone: 'UTC',
  notifyMorning: true,
  notifyProtocol: true,
  notifyEvening: true,
  notifyWeekly: true,
};
