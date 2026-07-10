/**
 * POST /api/ops/decision — log a decision on the live Decision Log. A row
 * created directly as "decided" gets decidedAt stamped immediately.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { OpsDecisionCreateSchema } from '@/lib/ops/schema';
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

  const decision = await prisma.companyOpsDecision.create({
    data: {
      ...body,
      decidedAt: body.status === 'decided' ? new Date() : null,
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
