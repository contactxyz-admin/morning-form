/**
 * PATCH/DELETE /api/ops/decision/[id]. The status flip owns decidedAt:
 * open -> decided stamps it, decided -> open clears it, so the log's aging
 * ("open 12d" / "decided 3d ago") stays honest without a separate write.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { OpsDecisionUpdateSchema } from '@/lib/ops/schema';
import { writeOpsAudit } from '@/lib/ops/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let body: ReturnType<typeof OpsDecisionUpdateSchema.parse>;
  try {
    body = OpsDecisionUpdateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const existing = await prisma.companyOpsDecision.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: 'Decision not found.' }, { status: 404 });
  }

  const decidedAt =
    body.status === undefined || body.status === existing.status
      ? undefined // status untouched -> leave decidedAt alone
      : body.status === 'decided'
        ? new Date()
        : null;

  let decision;
  try {
    decision = await prisma.companyOpsDecision.update({
      where: { id: params.id },
      data: { ...body, ...(decidedAt !== undefined ? { decidedAt } : {}) },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Decision not found.' }, { status: 404 });
    }
    throw err;
  }

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'decision.update',
    detail: { id: decision.id, ...body },
  });

  return NextResponse.json({ decision });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let existing;
  try {
    existing = await prisma.companyOpsDecision.delete({ where: { id: params.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Decision not found.' }, { status: 404 });
    }
    throw err;
  }

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'decision.delete',
    detail: { id: params.id, name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
