/**
 * GET /api/health/demo
 *
 * Cheap operational health check for the public demo at
 * `/r/demo-navigable-record`. Returns the topic count + freshness so
 * external monitors (Vercel Checks, uptime probes, manual eyeballing)
 * can detect drift the moment it happens instead of waiting for a user
 * to load the page and report "the demo is empty."
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
import { loadDemoTopicFixture } from '../../../../../prisma/fixtures/demo-navigable-record-topics';

const DEMO_EMAIL = 'demo@morningform.com';

export const dynamic = 'force-dynamic';

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
      { status: 503 },
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
  // diff against the deployed fixture if needed.
  let fixtureGeneratedAt: string | null = null;
  try {
    fixtureGeneratedAt = loadDemoTopicFixture().generatedAt;
  } catch {
    fixtureGeneratedAt = null;
  }

  if (missing.length > 0) {
    return NextResponse.json({
      status: 'degraded',
      reason: 'fewer topics than registry',
      topicCount: pages.length,
      registryCount: registryKeys.length,
      missing,
      fixtureGeneratedAt,
    });
  }

  return NextResponse.json({
    status: 'healthy',
    topicCount: pages.length,
    fixtureGeneratedAt,
  });
}
