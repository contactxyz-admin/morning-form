/**
 * Leaf constants for the GDPR export flow — no heavy imports (no @vercel/blob,
 * no prisma) so both the server assembler (src/lib/account/export.ts) and the
 * client Settings page can import these without bundling the assembler runtime.
 */

/**
 * Maximum wall-clock the export POST is allowed to run (the route's
 * `maxDuration`). Single source of truth: the API route's `maxDuration` and the
 * Settings page's "pending request is stale" threshold both derive from this so
 * they can never drift. A pending row older than this can never self-complete or
 * self-fail (a timeout kill cannot update its own row).
 */
export const EXPORT_MAX_DURATION_S = 300;
