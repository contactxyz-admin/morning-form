/**
 * GET /api/health/demo
 *
 * Cheap operational health check for the seeded `demo@morningform.com`
 * user — its graph + compiled TopicPages back the authed `/record` and
 * `/topics/[topicKey]` views in dev/E2E. Returns the topic count +
 * freshness so external monitors (Vercel Checks, uptime probes, manual
 * eyeballing) can detect drift before E2E tests trip over it.
 *
 * The public navigable-record demo now lives at `/demo/record` (fixture-
 * direct, no DB) — see
 * docs/plans/2026-05-16-001-feat-navigable-record-demo-plan.md. This
 * route still watches the seed-backed data because that's where drift
 * actually happens (fixture regen, schema changes, registry edits).
 *
 * Three outcomes:
 *   - 200 healthy: demo user exists, registry count == TopicPage count
 *     where status='full'. Body includes the count + the fixture's
 *     generatedAt for an at-a-glance staleness check.
 *   - 200 degraded: demo user exists but topic count is short of
 *     registry. Body explains which topics are missing. The response
 *     stays 200 so a transient deploy gap doesn't page on-call; the
 *     `status: 'degraded'` field is what monitors watch.
 *   - 503 broken: demo user missing entirely (seed never ran or was
 *     manually deleted). On-call should care about this.
 *
 * Public-safe: no PII in any response shape. No auth required.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { listTopicKeys } from '@/lib/topics/registry';
import { DEMO_EMAIL } from '../../../../../prisma/fixtures/demo-ids';
import { loadDemoTopicFixture } from '../../../../../prisma/fixtures/demo-navigable-record-topics';

// Dynamic route: the response depends on live DB state. We can't
// pre-render it at build time (the build env has no DB). Caching is
// done at the edge via Cache-Control headers on the response instead
// of via `revalidate`, since revalidate would mark the route static
// and trigger a build-time prerender attempt.
export const dynamic = 'force-dynamic';

/** 30-second CDN cache so monitor polling at high frequency doesn't
 *  hammer the DB. `s-maxage` controls Vercel's edge cache; `max-age=0`
 *  keeps the browser from caching past one request. */
const CACHE_HEADER = 'public, s-maxage=30, max-age=0, stale-while-revalidate=60';

export async function GET(): Promise<Response> {
  const user = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      {
        status: 'broken',
        reason: 'demo user missing',
      },
      { status: 503, headers: { 'Cache-Control': CACHE_HEADER } },
    );
  }

  const registryKeys = listTopicKeys();
  const pages = await prisma.topicPage.findMany({
    where: { userId: user.id, status: 'full' },
    select: { topicKey: true },
  });
  const presentKeys = new Set(pages.map((p) => p.topicKey));
  const missing = registryKeys.filter((k) => !presentKeys.has(k));

  // Fixture timestamp is informational — surfaces age + lets a watcher
  // diff against the deployed fixture if needed. A load failure (most
  // likely cause: the JSON wasn't traced into the Vercel Lambda — see
  // next.config.mjs outputFileTracingIncludes) is logged rather than
  // silently swallowed; the response degrades to `fixtureGeneratedAt:
  // null` so the route stays available.
  let fixtureGeneratedAt: string | null = null;
  try {
    fixtureGeneratedAt = loadDemoTopicFixture().generatedAt;
  } catch (err) {
    console.error(
      '[health/demo] fixture load failed:',
      err instanceof Error ? err.message : err,
    );
    fixtureGeneratedAt = null;
  }

  if (missing.length > 0) {
    return NextResponse.json(
      {
        status: 'degraded',
        reason: 'fewer topics than registry',
        topicCount: pages.length,
        registryCount: registryKeys.length,
        missing,
        fixtureGeneratedAt,
      },
      { headers: { 'Cache-Control': CACHE_HEADER } },
    );
  }

  return NextResponse.json(
    {
      status: 'healthy',
      topicCount: pages.length,
      fixtureGeneratedAt,
    },
    { headers: { 'Cache-Control': CACHE_HEADER } },
  );
}
