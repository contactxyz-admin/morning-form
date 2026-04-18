import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { generateStateProfile, generateProtocol } from '@/lib/protocol-engine';
import type {
  AssessmentResponses,
  Constraint,
  Observation,
  Protocol,
  Sensitivity,
  StateProfile,
} from '@/types';

/**
 * POST /api/assessment — persist the answers and the derived state/protocol.
 *
 * Idempotent by userId: re-submitting the same (or corrected) responses upserts
 * all three rows in a single transaction. Onboarding-status is derived by the
 * auth verify route from `user.assessment && user.stateProfile`, so a partial
 * write here would leave the user stuck bouncing back to /assessment on every
 * sign-in. Everything lands atomically or nothing does.
 *
 * ProtocolItems are rewritten on every upsert — the protocol-engine can produce
 * a different item set if the archetype changes (e.g. pregnancy flip), so we
 * deleteMany + createMany rather than trying to diff.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let responses: AssessmentResponses;
  try {
    const body = await request.json();
    responses = body.responses as AssessmentResponses;
    if (!responses || typeof responses !== 'object') {
      return NextResponse.json({ error: 'Invalid assessment responses' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const stateProfile = generateStateProfile(responses);
    const protocol = generateProtocol(responses);

    await prisma.$transaction(async (tx) => {
      await tx.assessmentResponse.upsert({
        where: { userId: user.id },
        update: { responses: JSON.stringify(responses), completedAt: new Date() },
        create: { userId: user.id, responses: JSON.stringify(responses) },
      });

      await tx.stateProfile.upsert({
        where: { userId: user.id },
        update: {
          archetype: stateProfile.archetype,
          primaryPattern: stateProfile.primaryPattern,
          patternDescription: stateProfile.patternDescription,
          observations: JSON.stringify(stateProfile.observations),
          constraints: JSON.stringify(stateProfile.constraints),
          sensitivities: JSON.stringify(stateProfile.sensitivities),
        },
        create: {
          userId: user.id,
          archetype: stateProfile.archetype,
          primaryPattern: stateProfile.primaryPattern,
          patternDescription: stateProfile.patternDescription,
          observations: JSON.stringify(stateProfile.observations),
          constraints: JSON.stringify(stateProfile.constraints),
          sensitivities: JSON.stringify(stateProfile.sensitivities),
        },
      });

      const persistedProtocol = await tx.protocol.upsert({
        where: { userId: user.id },
        update: {
          version: protocol.version,
          status: protocol.status,
          rationale: protocol.rationale,
          confidence: protocol.confidence,
        },
        create: {
          userId: user.id,
          version: protocol.version,
          status: protocol.status,
          rationale: protocol.rationale,
          confidence: protocol.confidence,
        },
      });

      await tx.protocolItem.deleteMany({ where: { protocolId: persistedProtocol.id } });
      await tx.protocolItem.createMany({
        data: protocol.items.map((item, idx) => ({
          protocolId: persistedProtocol.id,
          timeSlot: item.timeSlot,
          timeLabel: item.timeLabel,
          compounds: item.compounds,
          dosage: item.dosage,
          timingCue: item.timingCue,
          mechanism: item.mechanism,
          evidenceTier: item.evidenceTier,
          sortOrder: item.sortOrder ?? idx,
        })),
      });
    });

    return NextResponse.json({ stateProfile, protocol });
  } catch (error) {
    console.error('[API] Assessment error:', error);
    return NextResponse.json({ error: 'Failed to process assessment' }, { status: 500 });
  }
}

/**
 * GET /api/assessment — return the persisted state profile + protocol for the
 * current user. Powers /reveal/* pages, which used to read mockStateProfile.
 * Returns 404 when the user hasn't completed onboarding yet; callers should
 * route back to /assessment in that case.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const [stateRow, protocolRow] = await Promise.all([
    prisma.stateProfile.findUnique({ where: { userId: user.id } }),
    prisma.protocol.findUnique({
      where: { userId: user.id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    }),
  ]);

  if (!stateRow || !protocolRow) {
    return NextResponse.json({ error: 'Assessment not completed.' }, { status: 404 });
  }

  const stateProfile: StateProfile = {
    archetype: stateRow.archetype,
    primaryPattern: stateRow.primaryPattern,
    patternDescription: stateRow.patternDescription,
    observations: JSON.parse(stateRow.observations) as Observation[],
    constraints: JSON.parse(stateRow.constraints) as Constraint[],
    sensitivities: JSON.parse(stateRow.sensitivities) as Sensitivity[],
  };

  const protocol: Protocol = {
    id: protocolRow.id,
    version: protocolRow.version,
    status: protocolRow.status as Protocol['status'],
    rationale: protocolRow.rationale,
    confidence: protocolRow.confidence as Protocol['confidence'],
    items: protocolRow.items.map((item) => ({
      id: item.id,
      timeSlot: item.timeSlot as 'morning' | 'afternoon' | 'evening',
      timeLabel: item.timeLabel,
      compounds: item.compounds,
      dosage: item.dosage,
      timingCue: item.timingCue,
      mechanism: item.mechanism,
      evidenceTier: item.evidenceTier as 'strong' | 'moderate' | 'emerging',
      sortOrder: item.sortOrder,
    })),
  };

  return NextResponse.json({ stateProfile, protocol });
}
