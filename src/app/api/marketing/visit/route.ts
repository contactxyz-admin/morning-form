/**
 * POST /api/marketing/visit
 *
 * Phase 0 visit-beacon endpoint. Writes a single LandingPageVisit row per
 * (mfAnonymousId, slug, minute) so every anchor-page first-paint shows up
 * in the activation funnel. Public, no-auth — protected by:
 *
 *   - Slug + cohort + market allowlist validation (rejects fuzzed input
 *     before any DB write; emits `visit-beacon-input-rejected` diagnostic).
 *   - Per-IP rate-limit at 60/h via MagicLinkRateLimit (subjectKind=
 *     visit-beacon-ip-1h, R8 of plan); abusive bots get 429 cheaply.
 *   - Schema-level dedupe via @@unique([mfAnonymousId, slug, minuteBucket])
 *     so reload spam within a minute collapses onto one row, not app-layer
 *     race-prone checks.
 *
 * The mf_anon cookie is set by middleware on first visit to the marketing
 * tree (httpOnly, sameSite=lax). This route reads it server-side and
 * returns 400 if absent — should be impossible in normal flow because the
 * middleware always runs on the parent page render.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashIp } from '@/lib/auth/ip-hash';
import { isCohortKey } from '@/lib/marketing/cohorts';
import {
  ANONYMOUS_COOKIE,
  MARKETS,
  RATE_LIMIT_KINDS,
  VISIT_BEACON_HOURLY_CAP,
} from '@/lib/marketing/constants';
import { incrementDiagnostic } from '@/lib/marketing/diagnostic';
import { isMarket } from '@/lib/marketing/market';
import { getMarketingPage } from '@/lib/marketing/slug-allowlist';

// Conservative bot signature regex. Matches the AI-engine crawlers we
// want to count (so we know GEO is working) plus the obvious search/social
// bots; everything else falls into 'browser' or 'unknown'. Shipping bot
// visits to LandingPageVisit is intentional — we WANT to know AI-engine
// crawl rates as part of the funnel diagnostic surface.
const BOT_USER_AGENT_RE =
  /(googlebot|bingbot|gptbot|claudebot|perplexitybot|geminibot|duckduckbot|yandexbot|applebot|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|crawler|spider)/i;

const bodySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  cohort: z.string(),
  market: z.string(),
  referrer: z.string().max(2048).optional(),
});

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function bucketStart(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

function classifyUserAgent(ua: string | null): 'browser' | 'bot' | 'unknown' {
  if (!ua) return 'unknown';
  if (BOT_USER_AGENT_RE.test(ua)) return 'bot';
  return 'browser';
}

export async function POST(request: Request): Promise<Response> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    await incrementDiagnostic('visit-beacon-input-rejected');
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { slug, cohort, market, referrer } = parsed.data;

  // Allowlist guard — slug must exist in the registry, cohort + market in
  // the typed taxonomies. Rejects fuzzed analytics-pollution attempts.
  if (!isMarket(market) || !isCohortKey(cohort)) {
    await incrementDiagnostic('visit-beacon-input-rejected');
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const page = getMarketingPage(market, slug);
  if (!page || page.cohortKey !== cohort) {
    await incrementDiagnostic('visit-beacon-input-rejected');
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Anonymous-visitor id — middleware sets this cookie on first paint of
  // the marketing tree. If we ever see a visit-beacon POST without the
  // cookie, the visitor reached this endpoint without rendering a page —
  // either a misbehaving client or a direct fetch from elsewhere.
  const anonymousId =
    request.headers
      .get('cookie')
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${ANONYMOUS_COOKIE}=`))
      ?.split('=')[1] ?? null;

  if (!anonymousId) {
    await incrementDiagnostic('visit-beacon-no-anonymous-cookie');
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Per-IP rate limit. Same MagicLinkRateLimit table as the auth flow,
  // distinct subjectKind so the buckets do not collide.
  const ipHash = hashIp(request);
  const now = Date.now();
  const window = bucketStart(now, HOUR_MS);
  const rl = await prisma.magicLinkRateLimit.upsert({
    where: {
      subjectKind_subject_window: {
        subjectKind: RATE_LIMIT_KINDS.visitBeaconIp1h,
        subject: ipHash,
        window,
      },
    },
    create: {
      subjectKind: RATE_LIMIT_KINDS.visitBeaconIp1h,
      subject: ipHash,
      window,
      count: 1,
    },
    update: { count: { increment: 1 } },
  });
  if (rl.count > VISIT_BEACON_HOURLY_CAP) {
    await incrementDiagnostic('visit-beacon-rate-limit-1h');
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const userAgentClass = classifyUserAgent(request.headers.get('user-agent'));
  const minuteBucket = BigInt(Math.floor(now / MINUTE_MS));

  // Insert with ON CONFLICT DO NOTHING — the (mfAnonymousId, slug,
  // minuteBucket) unique key makes reload spam silently dedupe at the
  // schema level. Prisma's createMany with skipDuplicates models this.
  await prisma.landingPageVisit.createMany({
    data: [
      {
        slug,
        cohortKey: cohort,
        market,
        referrer: referrer ?? null,
        ipHash,
        mfAnonymousId: anonymousId,
        userAgentClass,
        minuteBucket,
      },
    ],
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true });
}
