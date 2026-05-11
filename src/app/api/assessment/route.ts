import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { generateStateProfile, buildPriorities } from '@/lib/priority-marker-engine';
import type {
  AssessmentResponses,
  Constraint,
  Observation,
  Priorities,
  PriorityMarker,
  Sensitivity,
  StateProfile,
} from '@/types';

/**
 * POST /api/assessment — persist the answers and the derived state/priorities.
 *
 * Idempotent by userId: re-submitting the same (or corrected) responses upserts
 * all three rows in a single transaction. Onboarding-status is derived by the
 * auth verify route from `user.assessment && user.stateProfile`, so a partial
 * write here would leave the user stuck bouncing back to /assessment on every
 * sign-in. Everything lands atomically or nothing does.
 *
 * PriorityMarker rows are rewritten on every upsert — the engine can produce
 * a different marker set if the archetype changes (e.g. pregnancy flip), so we
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
    const priorities = buildPriorities(responses);

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

      const persistedPriorities = await tx.priorities.upsert({
        where: { userId: user.id },
        update: {
          version: priorities.version,
          status: priorities.status,
          rationale: priorities.rationale,
          confidence: priorities.confidence,
        },
        create: {
          userId: user.id,
          version: priorities.version,
          status: priorities.status,
          rationale: priorities.rationale,
          confidence: priorities.confidence,
        },
      });

      await tx.priorityMarker.deleteMany({ where: { prioritiesId: persistedPriorities.id } });
      await tx.priorityMarker.createMany({
        data: priorities.items.map((item, idx) => ({
          prioritiesId: persistedPriorities.id,
          markerName: item.markerName,
          rationale: item.rationale,
          category: item.category,
          panelAvailability: item.panelAvailability,
          sortOrder: item.sortOrder ?? idx,
        })),
      });
    });

    return NextResponse.json({ stateProfile, priorities });
  } catch (error) {
    console.error('[API] Assessment error:', error);
    return NextResponse.json({ error: 'Failed to process assessment' }, { status: 500 });
  }
}

/**
 * GET /api/assessment — return the persisted state profile + priorities for
 * the current user. Powers /reveal/* pages. Returns 404 when the user hasn't
 * completed onboarding yet; callers should route back to /assessment in that
 * case.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const [stateRow, prioritiesRow] = await Promise.all([
    prisma.stateProfile.findUnique({ where: { userId: user.id } }),
    prisma.priorities.findUnique({
      where: { userId: user.id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    }),
  ]);

  if (!stateRow || !prioritiesRow) {
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

  const priorities: Priorities = {
    id: prioritiesRow.id,
    version: prioritiesRow.version,
    status: prioritiesRow.status as Priorities['status'],
    rationale: prioritiesRow.rationale,
    confidence: prioritiesRow.confidence as Priorities['confidence'],
    items: prioritiesRow.items.map((item): PriorityMarker => ({
      id: item.id,
      markerName: item.markerName,
      rationale: item.rationale,
      category: item.category,
      panelAvailability: item.panelAvailability as PriorityMarker['panelAvailability'],
      sortOrder: item.sortOrder,
    })),
  };

  return NextResponse.json({ stateProfile, priorities });
}
