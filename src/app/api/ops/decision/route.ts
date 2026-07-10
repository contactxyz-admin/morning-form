/**
 * POST /api/ops/decision — log a decision on the live Decision Log. A row
 * created directly as "decided" gets decidedAt stamped immediately.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { decidedAtTransition, OpsDecisionCreateSchema } from '@/lib/ops/schema';
import { writeOpsAudit } from '@/lib/ops/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let body: ReturnType<typeof OpsDecisionCreateSchema.parse>;
  try {
    body = OpsDecisionCreateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Append to the bottom: a fresh row must sort after the existing ones on
  // every founder's screen, not jump to the top tied at orderIndex 0.
  const { _max } = await prisma.companyOpsDecision.aggregate({
    where: { board: body.board },
    _max: { orderIndex: true },
  });
  const decision = await prisma.companyOpsDecision.create({
    data: {
      ...body,
      orderIndex: body.orderIndex ?? (_max.orderIndex ?? -1) + 1,
      decidedAt: decidedAtTransition(null, body.status) ?? null,
      createdBy: guard.user.email,
    },
  });

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'decision.create',
    detail: { id: decision.id, name: decision.name, status: decision.status },
  });

  return NextResponse.json({ decision }, { status: 201 });
}
