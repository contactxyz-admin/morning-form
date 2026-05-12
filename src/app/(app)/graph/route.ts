import { type NextRequest, NextResponse } from 'next/server';

/**
 * `/graph` is absorbed into `/record` by the vault unification
 * (docs/plans/2026-05-12-001-feat-record-vault-unification-plan.md, U1).
 * The graph canvas + grouped list view become a mode of `/record` rather
 * than a separate destination — same data, one mental model.
 *
 * 308 (Permanent Redirect) so crawlers + saved tabs land at /record. 308
 * preserves the request method and the query string carries through, so a
 * future `/graph?mode=map`-style deep-link still works after Phase 2 wires
 * URL-state into the unified surface.
 */
export function GET(request: NextRequest) {
  const target = new URL('/record', request.url);
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target, 308);
}
