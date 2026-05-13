import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { createMcpToken, listMcpTokensForUser } from '@/lib/mcp/tokens';

/**
 * Management routes for MCP bearer tokens.
 *
 * Auth model differs from `/api/mcp` itself: that route is bearer-only,
 * this surface is cookie-session-only. The split is intentional — a
 * leaked session can't grant programmatic graph access (no path here to
 * mint a token without the user's interactive browser session), and a
 * leaked MCP token can't be used to issue more MCP tokens.
 *
 * Raw tokens are returned exactly once, from `POST`. The DB stores only
 * the HMAC; the UI must surface the raw value immediately and never
 * persist it. `GET` returns metadata only.
 */

export const dynamic = 'force-dynamic';

const NO_STORE: HeadersInit = {
  'Cache-Control': 'no-store, private',
  Vary: 'Cookie',
};

// Five years is the practical ceiling — long enough for any real
// long-lived integration, short enough that a leaked token has an
// outer-bound revocation date even if the user forgets it exists.
const MAX_EXPIRY_MS = 5 * 365 * 24 * 60 * 60 * 1000;

const PostBodySchema = z
  .object({
    label: z.string().min(1).max(120),
    expiresAt: z.string().datetime().optional(),
  })
  .refine(
    (v) => {
      if (!v.expiresAt) return true;
      const t = new Date(v.expiresAt).getTime();
      if (!Number.isFinite(t)) return false;
      // Past-dated → DOA token (raw shown once, immediately invalid).
      // Year-9999 → effectively immortal. Reject both.
      const now = Date.now();
      return t > now && t <= now + MAX_EXPIRY_MS;
    },
    { message: 'expiresAt must be in the future and within 5 years.' },
  );

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const tokens = await listMcpTokensForUser(prisma, user.id);
  // Shape for the wire — strip nothing here; the raw token is never on
  // these rows in the first place, and revoked/expired entries are
  // intentionally included so the UI can render audit history.
  return NextResponse.json(
    {
      tokens: tokens.map((t) => ({
        id: t.id,
        label: t.label,
        expiresAt: t.expiresAt?.toISOString() ?? null,
        revokedAt: t.revokedAt?.toISOString() ?? null,
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        useCount: t.useCount,
        createdAt: t.createdAt.toISOString(),
      })),
    },
    { headers: NO_STORE },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = PostBodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 422 });
  }

  const expiresAt = parsed.expiresAt ? new Date(parsed.expiresAt) : null;
  const created = await createMcpToken(prisma, {
    userId: user.id,
    label: parsed.label,
    expiresAt,
  });

  // rawToken is in the response — surfaced to the issuing user exactly
  // once. Cache-Control: no-store ensures no intermediary buffers it.
  return NextResponse.json(
    {
      id: created.id,
      label: created.label,
      rawToken: created.rawToken,
      expiresAt: created.expiresAt?.toISOString() ?? null,
    },
    { headers: NO_STORE },
  );
}
