/**
 * POST /api/intake/submit — end-to-end intake pipeline.
 *
 * 1. Parse body (historyText, essentials, documentNames).
 * 2. Extract: chunk + LLM-call + zod-validate (src/lib/intake/extract.ts).
 * 3. Persist: single transaction creates SourceDocument + chunks + nodes +
 *    SUPPORTS + associative edges (src/lib/graph/mutations.ts#ingestExtraction).
 * 4. Upsert tentative `TopicPage(status: stub)` rows for any v1 topic where
 *    the extracted graph contains a matching node.
 *
 * Idempotency: driven by (userId, contentHash) dedup on SourceDocument. Same
 * payload re-submitted returns the same persisted ids and no duplicate rows.
 *
 * Errors:
 * - 400 on malformed body (missing essentials / not-JSON)
 * - 502 on LLM failures (auth / transient / validation)
 * - 500 on anything else
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { LLMClient } from '@/lib/llm/client';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMTransientError,
  LLMValidationError,
} from '@/lib/llm/errors';
import { extractFromIntake } from '@/lib/intake/extract';
import { ingestExtraction } from '@/lib/graph/mutations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodySchema = z.object({
  historyText: z.string().default(''),
  essentials: z.object({
    goals: z.string().default(''),
    currentMedications: z.string().default(''),
    currentDiagnoses: z.string().default(''),
    allergies: z.string().default(''),
  }),
  documentNames: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    body = BodySchema.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid intake payload', detail: err instanceof Error ? err.message : 'parse error' },
      { status: 400 },
    );
  }

  // Enforce the same "goals + at least one of {meds, diagnoses, allergies}"
  // rule the UI enforces, so the API is the authoritative gate.
  const e = body.essentials;
  const hasGoals = e.goals.trim().length > 0;
  const hasOther = [e.currentMedications, e.currentDiagnoses, e.allergies].some(
    (v) => v.trim().length > 0,
  );
  if (!hasGoals || !hasOther) {
    return NextResponse.json(
      { error: 'Essentials incomplete: goals + at least one of {meds, diagnoses, allergies} required' },
      { status: 400 },
    );
  }

  try {
    const user = await getCurrentUser();
    const client = new LLMClient();

    const { ingestInput, tentativeTopicStubs } = await extractFromIntake(
      { client, prisma },
      user.id,
      {
        historyText: body.historyText,
        essentials: body.essentials,
        documentNames: body.documentNames,
      },
    );

    const persisted = await ingestExtraction(prisma, user.id, ingestInput);

    // Tentative topic stubs — created only if not already present. We don't
    // reset existing TopicPage rows (a topic already at status=ready must not
    // regress to stub just because a new intake landed).
    for (const topicKey of tentativeTopicStubs) {
      await prisma.topicPage.upsert({
        where: { userId_topicKey: { userId: user.id, topicKey } },
        create: { userId: user.id, topicKey, status: 'stub' },
        update: {}, // preserve existing status
      });
    }

    return NextResponse.json({
      documentId: persisted.documentId,
      nodeCount: persisted.nodeIds.length,
      edgeCount: persisted.edgeIds.length,
      droppedEdges: persisted.droppedEdges,
      tentativeTopicStubs,
    });
  } catch (err) {
    if (
      err instanceof LLMAuthError ||
      err instanceof LLMRateLimitError ||
      err instanceof LLMTransientError ||
      err instanceof LLMValidationError
    ) {
      console.error('[API] intake/submit LLM error:', err);
      return NextResponse.json(
        { error: 'Extraction service error', kind: err.constructor.name },
        { status: 502 },
      );
    }
    console.error('[API] intake/submit error:', err);
    return NextResponse.json({ error: 'Intake submit failed' }, { status: 500 });
  }
}
