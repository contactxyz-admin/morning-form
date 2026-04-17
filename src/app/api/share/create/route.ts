import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { getCurrentUser } from '@/lib/session';
import { createShare, type ShareScope, type ShareRedactions } from '@/lib/share/tokens';

/**
 * POST /api/share/create
 *
 * Body: { scope, redactions?, label?, expiresAt? }
 * Returns: { id, rawToken, url, expiresAt }
 *
 * The rawToken is only surfaced once — right here, in the response. It is
 * not stored in plaintext, so the owner must copy the URL immediately.
 * Subsequent reads (listSharesForUser) return metadata only.
 *
 * Ownership enforcement: for `{kind: "node", nodeId}` scopes we verify the
 * node belongs to the current user before minting a token, and respond 404
 * (not 400/403) so a probing attacker can't enumerate valid node ids.
 *
 * Host-safety: the returned `url` is built from NEXT_PUBLIC_APP_URL, not
 * `req.nextUrl.origin`. A forwarded Host / X-Forwarded-Host from a
 * malicious upstream could otherwise yield a URL pointing at an attacker-
 * controlled domain — the raw token only works on our real host, but the
 * owner might copy and forward the spoofed URL straight into a phishing
 * vector before noticing.
 */

export const dynamic = 'force-dynamic';

const TopicScopeSchema = z.object({ kind: z.literal('topic'), topicKey: z.string().min(1) });
const NodeScopeSchema = z.object({ kind: z.literal('node'), nodeId: z.string().min(1) });
const ScopeSchema = z.union([TopicScopeSchema, NodeScopeSchema]);

const BodySchema = z.object({
  scope: ScopeSchema,
  redactions: z
    .object({ hideNodeIds: z.array(z.string().min(1)).max(200).optional() })
    .optional(),
  label: z.string().max(120).optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid share request.', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 422 },
    );
  }

  if (parsed.scope.kind === 'node') {
    const owned = await prisma.graphNode.findFirst({
      where: { id: parsed.scope.nodeId, userId: user.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Node not found.' }, { status: 404 });
    }
  }

  const { id, rawToken, expiresAt } = await createShare(prisma, {
    userId: user.id,
    scope: parsed.scope as ShareScope,
    redactions: parsed.redactions as ShareRedactions | undefined,
    label: parsed.label,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
  });

  const origin = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const url = `${origin}/share/${rawToken}`;

  return NextResponse.json({ id, rawToken, url, expiresAt });
}
