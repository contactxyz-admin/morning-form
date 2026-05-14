import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { writeFunnelEvent } from '@/lib/funnel/event';

/**
 * POST /api/events — activation-funnel event ingestion.
 *
 * Public endpoint (no auth gate): pre-signin events like landing_viewed
 * and assessment_started MUST be writable without a session. If the
 * caller IS signed in, we backfill `userId` so post-signin events stitch
 * to the User row.
 *
 * Body cap is enforced at the schema level (properties capped to 2KB
 * in writeFunnelEvent). Event name is a free string for v1 — the
 * canonical vocabulary lives in `FUNNEL_EVENTS` (src/lib/funnel/event.ts)
 * but we don't reject unknown names here so client-side experimentation
 * works without backend deploys.
 *
 * Always returns 204. Even validation failures (malformed body) return
 * a soft success — analytics must not surface in DevTools or Sentry as
 * "user broke the app." Real failures log to stderr only.
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  funnelId: z.string().min(8).max(64),
  event: z.string().min(1).max(80),
  path: z.string().max(2048).optional().nullable(),
  properties: z.unknown().optional().nullable(),
});

export async function POST(req: Request): Promise<Response> {
  let parsed: z.infer<typeof BodySchema> | null = null;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    // Soft success — see route docstring.
    return new NextResponse(null, { status: 204 });
  }

  // Best-effort user join. The auth lookup is the only DB query before
  // the write, and it can fail (e.g. session DB unavailable) without
  // breaking event capture — try/catch isolates it from the write.
  let userId: string | null = null;
  try {
    const user = await getCurrentUser();
    userId = user?.id ?? null;
  } catch {
    /* swallow — anonymous event still gets written */
  }

  await writeFunnelEvent(prisma, {
    funnelId: parsed.funnelId,
    userId,
    event: parsed.event,
    path: parsed.path ?? null,
    properties: parsed.properties ?? null,
  });

  return new NextResponse(null, { status: 204 });
}
