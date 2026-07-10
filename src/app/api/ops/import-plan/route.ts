/**
 * POST /api/ops/import-plan {kind: 'contacts' | 'decisions'} — one-shot
 * seeding of the live Contacts/Decisions tables from the static PILOT_PLAN
 * reference data. The emptiness check and the insert run in one SERIALIZABLE
 * transaction (no unique constraint backs this table), so two founders
 * clicking import at the same moment can't double-seed: one wins, the other
 * gets a 409, never duplicates. After that, rows are managed through the
 * normal CRUD routes.
 *
 * Imported "Decided" rows get decidedAt = null on purpose: the plan snapshot
 * doesn't record WHEN the call was made, and stamping import time would
 * fake the aging display.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireOpsStaff } from '@/lib/ops/rest-guard';
import { writeOpsAudit } from '@/lib/ops/audit';
import { serializeOpsContact, serializeOpsDecision } from '@/lib/ops/serialize';
import { planContactSeeds, planDecisionSeeds } from '@/lib/ops/pilot-plan-data';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ kind: z.enum(['contacts', 'decisions']) });

const CONFLICT = { error: 'Already imported.' };

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireOpsStaff();
  if (!guard.ok) return guard.response;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    if (body.kind === 'contacts') {
      const rows = await prisma.$transaction(
        async (tx) => {
          if ((await tx.companyOpsContact.count({ where: { board: 'pilot' } })) > 0) return null;
          return tx.companyOpsContact.createManyAndReturn({
            data: planContactSeeds().map((seed, i) => ({
              board: 'pilot',
              ...seed,
              orderIndex: i,
              createdBy: guard.user.email,
            })),
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (rows === null) return NextResponse.json(CONFLICT, { status: 409 });

      await writeOpsAudit(prisma, {
        actor: guard.user.email,
        action: 'plan.import',
        detail: { kind: body.kind, imported: rows.length },
      });
      const contacts = rows
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(serializeOpsContact);
      return NextResponse.json({ imported: rows.length, contacts }, { status: 201 });
    }

    const rows = await prisma.$transaction(
      async (tx) => {
        if ((await tx.companyOpsDecision.count({ where: { board: 'pilot' } })) > 0) return null;
        return tx.companyOpsDecision.createManyAndReturn({
          data: planDecisionSeeds().map((seed, i) => ({
            board: 'pilot',
            name: seed.name,
            options: seed.options,
            rationale: seed.rationale,
            status: seed.decided ? 'decided' : 'open',
            decidedAt: null,
            orderIndex: i,
            createdBy: guard.user.email,
          })),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (rows === null) return NextResponse.json(CONFLICT, { status: 409 });

    await writeOpsAudit(prisma, {
      actor: guard.user.email,
      action: 'plan.import',
      detail: { kind: body.kind, imported: rows.length },
    });
    const decisions = rows
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(serializeOpsDecision);
    return NextResponse.json({ imported: rows.length, decisions }, { status: 201 });
  } catch (err) {
    // P2034: serialization failure — a concurrent import won the race.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      return NextResponse.json(CONFLICT, { status: 409 });
    }
    throw err;
  }
}
