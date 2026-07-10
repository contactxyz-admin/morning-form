/**
 * POST /api/ops/import-plan {kind: 'contacts' | 'decisions'} — one-shot
 * seeding of the live Contacts/Decisions tables from the static PILOT_PLAN
 * reference data. Refuses (409) once any live rows exist so it can never
 * clobber or duplicate real pipeline state; after that, rows are managed
 * through the normal CRUD routes.
 *
 * Imported "Decided" rows get decidedAt = null on purpose: the plan snapshot
 * doesn't record WHEN the call was made, and stamping import time would
 * fake the aging display.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { writeOpsAudit } from '@/lib/ops/audit';
import { listOpsContacts, listOpsDecisions } from '@/lib/ops/queries';
import { serializeOpsContact, serializeOpsDecision } from '@/lib/ops/serialize';
import { PILOT_PLAN } from '@/lib/ops/pilot-plan-data';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ kind: z.enum(['contacts', 'decisions']) });

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let imported: number;
  if (body.kind === 'contacts') {
    const existing = await prisma.companyOpsContact.count({ where: { board: 'pilot' } });
    if (existing > 0) {
      return NextResponse.json({ error: 'Contacts already imported.' }, { status: 409 });
    }
    const result = await prisma.companyOpsContact.createMany({
      data: PILOT_PLAN.contacts.map(([org, contact, type, status, nextStep], i) => ({
        board: 'pilot',
        org,
        contact,
        type,
        status,
        nextStep,
        orderIndex: i,
        createdBy: guard.user.email,
      })),
    });
    imported = result.count;
  } else {
    const existing = await prisma.companyOpsDecision.count({ where: { board: 'pilot' } });
    if (existing > 0) {
      return NextResponse.json({ error: 'Decisions already imported.' }, { status: 409 });
    }
    const result = await prisma.companyOpsDecision.createMany({
      data: PILOT_PLAN.decisions.map(([name, options, rationale, status], i) => ({
        board: 'pilot',
        name,
        options,
        rationale: rationale ?? '',
        status: status === 'Decided' ? 'decided' : 'open',
        decidedAt: null,
        orderIndex: i,
        createdBy: guard.user.email,
      })),
    });
    imported = result.count;
  }

  await writeOpsAudit(prisma, {
    actor: guard.user.email,
    action: 'plan.import',
    detail: { kind: body.kind, imported },
  });

  // Return the created rows so the client can render without a reload.
  if (body.kind === 'contacts') {
    const contacts = (await listOpsContacts(prisma)).map(serializeOpsContact);
    return NextResponse.json({ imported, contacts }, { status: 201 });
  }
  const decisions = (await listOpsDecisions(prisma)).map(serializeOpsDecision);
  return NextResponse.json({ imported, decisions }, { status: 201 });
}
