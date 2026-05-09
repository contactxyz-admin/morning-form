/**
 * Stable per-IP hash for rate-limiting and analytics.
 *
 * HMAC-SHA256 over the lower-cased IP with the session secret as key.
 * The 32-char prefix is enough to make collisions astronomically rare
 * across millions of requests while keeping the column narrow.
 *
 * Single source of truth: every caller (magic-link request endpoint,
 * marketing visit-beacon, future upload route) imports from here so a
 * SESSION_SECRET rotation doesn't silently mismatch historical hashes
 * against new visits.
 */
import { createHmac } from 'node:crypto';
import { getSessionSecret } from '@/lib/env';

/**
 * Read the visitor's IP from standard proxy headers, falling back to
 * `unknown` when no header is present (rare in production behind Vercel
 * Edge, common in tests). The `unknown` bucket means localhost or proxy-
 * less clients all share a single hash, which is fine — rate-limit by
 * email is the second channel that catches abuse from that bucket.
 */
export function hashIp(request: Request): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return createHmac('sha256', getSessionSecret())
    .update('ip:')
    .update(ip)
    .digest('hex')
    .slice(0, 32);
}
