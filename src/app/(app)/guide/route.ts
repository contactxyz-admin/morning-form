import { type NextRequest, NextResponse } from 'next/server';

/**
 * `/guide` is retired by the priority-markers pivot
 * (docs/plans/2026-05-10-001-feat-priority-markers-pivot-plan.md, U6).
 * The previous page was a hardcoded keyword-match pseudo-assistant pushing
 * the supplement-protocol legacy content. The real assistant is `/ask`.
 *
 * 308 (Permanent Redirect) so crawlers + saved tabs land at /ask. 308
 * preserves the request method, unlike 301/302 which downgrade POST to GET.
 */
export function GET(request: NextRequest) {
  const target = new URL('/ask', request.url);
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target, 308);
}
