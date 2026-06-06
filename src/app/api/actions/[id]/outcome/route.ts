/**
 * POST /api/actions/[id]/outcome — mark outcome-measured with frozen snapshot (U4).
 *
 * Atomically: writes ActionOutcome snapshot + flips action state to
 * outcome-measured in one $transaction. Requires state===completed and
 * verb===measure. Derives before/after from the trajectory reader.
 *
 * Flag-gated on DECISIONS_ENABLED.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';
import { resolveTransition } from '@/lib/actions/lifecycle';
import { buildMarkerTrajectory } from '@/lib/markers/trajectory';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  /** Optional override for the after-value (default: derived from latest trajectory point). */
  afterValue: z.number().optional(),
  /** Optional override for the after-date. */
  afterAt: z.string().optional(),
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

  // Read with ownership check.
  const action = await prisma.action.findUnique({
    where: { id: actionId },
    select: { id: true, userId: true, state: true, verb: true, markerName: true },
  });
  if (!action || action.userId !== user.id) {
    return NextResponse.json({ error: 'Action not found.' }, { status: 404 });
  }

  // Validate: must be completed + measure verb.
  if (!resolveTransition(action.state, 'outcome-measured', action.verb)) {
    return NextResponse.json(
      { error: `Cannot mark outcome: action is ${action.state} (verb: ${action.verb}). Requires completed + measure.` },
      { status: 409 },
    );
  }

  // Derive marker values from the trajectory reader.
  let beforeValue: number | null = null;
  let beforeAt: string | null = null;
  let afterValue = body.afterValue ?? null;
  let afterAt = body.afterAt ?? null;

  if (action.markerName) {
    const pts = await buildMarkerTrajectory(prisma, user.id, action.markerName);
    if (pts.length >= 2) {
      // newest first → pts[0] is after, pts[pts.length-1] is before
      const newest = pts[0];
      const oldest = pts[pts.length - 1];
      afterValue = afterValue ?? newest.value;
      afterAt = afterAt ?? newest.timestamp;
      beforeValue = oldest.value;
      beforeAt = oldest.timestamp;
    } else if (pts.length === 1) {
      afterValue = afterValue ?? pts[0].value;
      afterAt = afterAt ?? pts[0].timestamp;
      // before remains null — single-point trajectory.
    }
  }

  if (afterValue === null) {
    return NextResponse.json(
      { error: 'Cannot determine outcome values. Provide afterValue explicitly or ensure marker data exists.' },
      { status: 400 },
    );
  }

  // Atomic: write snapshot + flip state in one transaction.
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Conditional state flip — only if still completed.
      const flip = await tx.action.updateMany({
        where: { id: actionId, userId: user.id, state: 'completed' },
        data: { state: 'outcome-measured' },
      });
      if (flip.count === 0) {
        throw new ConflictError('Action state has changed — please refresh.');
      }

      return tx.actionOutcome.create({
        data: {
          actionId,
          userId: user.id,
          markerName: action.markerName ?? 'unknown',
          beforeValue: beforeValue ?? null,
          beforeAt: beforeAt ? new Date(beforeAt) : null,
          afterValue,
          afterAt: afterAt ? new Date(afterAt) : null,
        },
      });
    });

    return NextResponse.json({
      id: outcome.id,
      actionId: outcome.actionId,
      markerName: outcome.markerName,
      beforeValue: outcome.beforeValue,
      beforeAt: outcome.beforeAt?.toISOString() ?? null,
      afterValue: outcome.afterValue,
      afterAt: outcome.afterAt?.toISOString() ?? null,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
