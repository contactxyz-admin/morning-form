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
// LLM per-attempt timeout is 90 s with up to 3 attempts, and we need DB
// work on either side. A 90 s ceiling would 504 on the first slow
// attempt before the retry budget could run. Vercel Pro caps at 300 s.
export const maxDuration = 300;

// Size caps protect against DoS / token-budget abuse. 50KB of history covers
// a long but reasonable intake; essentials fields are short-answer by design.
const BodySchema = z.object({
  historyText: z.string().max(50_000).default(''),
  essentials: z.object({
    goals: z.string().max(2_000).default(''),
    currentMedications: z.string().max(4_000).default(''),
    currentDiagnoses: z.string().max(4_000).default(''),
    allergies: z.string().max(1_000).default(''),
  }),
  documentNames: z.array(z.string().max(512)).max(50).default([]),
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
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
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

    // ingestInput carries tentativeTopicStubs — the upserts happen inside the
    // same transaction as the graph writes, so a partial-success window is
    // impossible. Previously a mid-route crash could persist the graph but
    // skip stubs, leaving a 500 despite the ingest succeeding.
    const persisted = await ingestExtraction(prisma, user.id, ingestInput);

    return NextResponse.json({
      documentId: persisted.documentId,
      nodeCount: persisted.nodeIds.length,
      edgeCount: persisted.edgeIds.length,
      droppedEdges: persisted.droppedEdges,
      tentativeTopicStubs,
    });
  } catch (err) {
    // Log message + name only — `err` itself can carry the offending user
    // input (Zod `input` field, Prisma conflicting values), which is PHI for
    // this route.
    const name = err instanceof Error ? err.name : 'UnknownError';
    const message = err instanceof Error ? err.message : String(err);
    if (
      err instanceof LLMAuthError ||
      err instanceof LLMRateLimitError ||
      err instanceof LLMTransientError ||
      err instanceof LLMValidationError
    ) {
      console.error(`[API] intake/submit LLM error: ${name}: ${message}`);
      return NextResponse.json(
        { error: 'Extraction service error', kind: err.constructor.name },
        { status: 502 },
      );
    }
    console.error(`[API] intake/submit error: ${name}: ${message}`);
    return NextResponse.json({ error: 'Intake submit failed' }, { status: 500 });
  }
}
