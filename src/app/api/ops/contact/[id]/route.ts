/**
 * PATCH/DELETE /api/ops/contact/[id] — partial update and hard delete for a
 * Contacts pipeline row. Any PATCH bumps updatedAt, which the UI reads as
 * "last touched" for staleness.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { OpsContactUpdateSchema } from '@/lib/ops/schema';
import { writeOpsAudit } from '@/lib/ops/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let body: ReturnType<typeof OpsContactUpdateSchema.parse>;
  try {
    body = OpsContactUpdateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let contact;
  try {
    contact = await prisma.companyOpsContact.update({ where: { id: params.id }, data: body });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
    }
    throw err;
  }

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'contact.update',
    detail: { id: contact.id, ...body },
  });

  return NextResponse.json({ contact });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let existing;
  try {
    existing = await prisma.companyOpsContact.delete({ where: { id: params.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
    }
    throw err;
  }

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'contact.delete',
    detail: { id: params.id, org: existing.org },
  });

  return NextResponse.json({ ok: true });
}
