/**
 * POST /api/actions/[id]/transition — action lifecycle transitions (Phase B U2).
 *
 * Flag-gated behind DECISIONS_ENABLED. User-scoped: ownership check first,
 * then conditional updateMany on (id, userId, state:'<from>') for race-safety.
 * Another user's action → 404 (no existence leak). Invalid transition → 409.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';
import { resolveTransition } from '@/lib/actions/lifecycle';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  /** Target state. */
  to: z.enum(['accepted', 'completed', 'dismissed', 'outcome-measured']),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  if (env.DECISIONS_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Decisions are not enabled.' }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const actionId = params.id;

  // Read with ownership check — not-owned → 404 (no existence leak).
  const action = await prisma.action.findUnique({
    where: { id: actionId },
    select: { id: true, userId: true, state: true, verb: true },
  });
  if (!action || action.userId !== user.id) {
    return NextResponse.json({ error: 'Action not found.' }, { status: 404 });
  }

  // Validate the transition.
  const t = resolveTransition(action.state, body.to, action.verb);
  if (!t) {
    return NextResponse.json(
      { error: `Cannot transition from ${action.state} to ${body.to}.` },
      { status: 409 },
    );
  }

  // Race-safe conditional update: only moves if state is still the expected one.
  const now = new Date();
  const data: Record<string, unknown> = { state: body.to };
  if (t.timestampField) {
    data[t.timestampField] = now;
  }

  const result = await prisma.action.updateMany({
    where: { id: actionId, userId: user.id, state: action.state },
    data,
  });

  if (result.count === 0) {
    // State changed between our read and write — likely a concurrent transition.
    return NextResponse.json(
      { error: 'Action state has changed — please refresh.' },
      { status: 409 },
    );
  }

  return NextResponse.json({
    id: actionId,
    state: body.to,
    ...(t.timestampField ? { [t.timestampField]: now.toISOString() } : {}),
  });
}
