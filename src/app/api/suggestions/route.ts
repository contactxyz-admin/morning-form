import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowUtc() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    const today = todayUtc();

    // Pending suggestions are scoped to today's generation date. Snoozed
    // suggestions resurface whenever their snoozeUntil has come due,
    // regardless of which day they were originally generated.
    const suggestions = await prisma.dailySuggestion.findMany({
      where: {
        userId: user.id,
        OR: [
          { status: 'pending', date: today },
          { status: 'snoozed', snoozeUntil: { lte: today } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('[API] Suggestions GET error:', error);
    return NextResponse.json({ error: 'Failed to load suggestions' }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['accept', 'dismiss', 'snooze']),
});

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Body must be { id, action: "accept" | "dismiss" | "snooze" }' },
        { status: 400 }
      );
    }

    const { id, action } = parsed.data;

    const existing = await prisma.dailySuggestion.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }
    if (existing.status === 'accepted' || existing.status === 'dismissed') {
      return NextResponse.json(
        { error: `Suggestion already ${existing.status}` },
        { status: 409 }
      );
    }

    if (action === 'dismiss') {
      const updated = await prisma.dailySuggestion.update({
        where: { id },
        data: { status: 'dismissed' },
      });
      return NextResponse.json({ suggestion: updated });
    }

    if (action === 'snooze') {
      const updated = await prisma.dailySuggestion.update({
        where: { id },
        data: { status: 'snoozed', snoozeUntil: tomorrowUtc() },
      });
      return NextResponse.json({ suggestion: updated });
    }

    // accept: create a ProtocolAdjustment in the user's Protocol (creating one if missing),
    // then link it back to the suggestion in a single transaction.
    const result = await prisma.$transaction(async (tx) => {
      let protocol = await tx.protocol.findUnique({ where: { userId: user.id } });
      if (!protocol) {
        protocol = await tx.protocol.create({
          data: {
            userId: user.id,
            rationale: 'Auto-created from your first accepted suggestion.',
          },
        });
      }

      const adjustment = await tx.protocolAdjustment.create({
        data: {
          protocolId: protocol.id,
          description: existing.title,
          rationale: existing.rationale,
        },
      });

      const suggestion = await tx.dailySuggestion.update({
        where: { id },
        data: { status: 'accepted', acceptedAdjustmentId: adjustment.id },
      });

      return { suggestion, adjustment };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Suggestions PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update suggestion' }, { status: 500 });
  }
}
