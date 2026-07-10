/**
 * POST /api/ops/contact — add an outreach row to the live Contacts pipeline.
 * Same guard/audit discipline as /api/ops/task; no notify path (contacts have
 * no assignee).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { OpsContactCreateSchema } from '@/lib/ops/schema';
import { writeOpsAudit } from '@/lib/ops/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let body: ReturnType<typeof OpsContactCreateSchema.parse>;
  try {
    body = OpsContactCreateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Append to the bottom: a fresh row must sort after the existing ones on
  // every founder's screen, not jump to the top tied at orderIndex 0.
  const { _max } = await prisma.companyOpsContact.aggregate({
    where: { board: body.board },
    _max: { orderIndex: true },
  });
  const contact = await prisma.companyOpsContact.create({
    data: { ...body, orderIndex: body.orderIndex ?? (_max.orderIndex ?? -1) + 1, createdBy: guard.user.email },
  });

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'contact.create',
    detail: { id: contact.id, org: contact.org },
  });

  return NextResponse.json({ contact }, { status: 201 });
}
