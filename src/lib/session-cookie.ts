/**
 * Edge-safe constants for the session cookie.
 *
 * Kept separate from `@/lib/session` so modules that need only the cookie
 * name (notably `src/middleware.ts`, which runs on the Edge runtime) do not
 * transitively import `node:crypto`. Edge cannot bundle Node built-ins and
 * the full session module uses them for token hashing and session minting.
 */
export const SESSION_COOKIE = 'mf_session';
