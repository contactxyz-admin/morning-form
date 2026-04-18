/**
 * POST /api/scribe/explain — runtime selection→Explain SSE endpoint.
 *
 * Contract:
 *   Body: { topicKey: string, selection: string, requestId?: string }
 *   Success: `text/event-stream` with three event kinds:
 *     - `meta`:  { requestId, scribeId, modelVersion }
 *     - `token`: { text }         (one or more; the visible streamed output)
 *     - `done`:  { classification, output, citations }
 *   Failure before stream starts: JSON 4xx/5xx.
 *   Failure during stream: `event: error\ndata: {"error": "..."}` on the stream.
 *
 * Invariants:
 *   - D10: `userId` + `topicKey` are resolved once from the session + body and
 *     threaded into `execute()` as the tool context.
 *   - D11: audit row lands for every invocation (via `execute()`), even when
 *     the gate rejects the output. A client disconnect mid-stream cannot
 *     produce a missing audit — the audit is written before the SSE stream
 *     begins emitting tokens.
 *   - Rejection-safe surface: if the scribe's classification is `rejected` or
 *     `out-of-scope-routed`, the raw output is NOT streamed to the client. A
 *     fixed safe-fallback string is emitted instead; the real classification
 *     still travels in the `done` event so the UI can show the right surface.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { execute } from '@/lib/scribe/execute';
import { getScribeLLMClient } from '@/lib/scribe/llm';
import { getPolicy } from '@/lib/scribe/policy/registry';
import { ScribeAuditWriteError } from '@/lib/scribe/repo';
import { parseScribeAnnotations } from '@/lib/scribe/annotations';
import type { Citation } from '@/lib/topics/types';
import type { SafetyClassification } from '@/lib/scribe/policy/types';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  topicKey: z.string().min(1),
  selection: z.string().min(1).max(2000),
  requestId: z.string().uuid().optional(),
});

const FALLBACK_OUTPUT =
  "I can't answer that here — I've suggested a prompt for your GP instead.";

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Invalid explain request.',
        details: err instanceof Error ? err.message : 'parse failed',
      },
      { status: 400 },
    );
  }

  const policy = getPolicy(parsed.topicKey);
  if (!policy) {
    return NextResponse.json(
      { error: `Unknown topic: ${parsed.topicKey}` },
      { status: 400 },
    );
  }

  let llm;
  try {
    llm = getScribeLLMClient();
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Scribe LLM client is not configured.',
        details: err instanceof Error ? err.message : 'factory failed',
      },
      { status: 503 },
    );
  }

  // Run the scribe to completion before opening the stream. D11 requires the
  // audit row to land before we surface anything; streaming tokens before the
  // audit is persisted would invert that ordering for the happy path.
  let result;
  try {
    result = await execute({
      db: prisma,
      userId: user.id,
      topicKey: parsed.topicKey,
      mode: 'runtime',
      userMessage: buildRuntimePrompt(parsed.topicKey, parsed.selection, policy.allowedJudgmentKinds),
      declaredJudgmentKind: null, // let enforce() route — the scribe self-declares in output
      llm,
      requestId: parsed.requestId,
    });
  } catch (err) {
    // ScribeAuditWriteError is structurally load-bearing — surface distinctly
    // so the caller knows the audit row failed, separate from a loop error.
    if (err instanceof ScribeAuditWriteError) {
      return NextResponse.json(
        { error: 'Audit write failed.', details: err.message },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        error: 'Scribe execution failed.',
        details: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }

  const visibleOutput =
    result.classification === 'clinical-safe' ? result.output : FALLBACK_OUTPUT;
  const visibleCitations: Citation[] =
    result.classification === 'clinical-safe' ? extractCitations(result.output) : [];

  const stream = buildSseStream({
    requestId: result.requestId,
    modelVersion: result.modelVersion,
    output: visibleOutput,
    classification: result.classification,
    citations: visibleCitations,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function buildRuntimePrompt(
  topicKey: string,
  selection: string,
  allowedJudgmentKinds: readonly string[],
): string {
  return [
    `You are the specialist scribe for "${topicKey}".`,
    `Explain this passage briefly (2-3 sentences): "${selection}".`,
    `Stay within your scope of practice: ${allowedJudgmentKinds.join(', ')}.`,
    `Cite graph nodes by id. Refer anything outside your scope to "Discuss with clinician" rather than answering partially.`,
  ].join(' ');
}

function extractCitations(output: string): Citation[] {
  // The runtime scribe may or may not emit an ANNOTATIONS_JSON block. A
  // malformed block yields `annotations: []`, so extraction degrades
  // gracefully; we never reject the SSE stream because of a parse failure.
  const { annotations } = parseScribeAnnotations(output);
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const ann of annotations) {
    for (const c of ann.citations) {
      const key = `${c.nodeId}:${c.chunkId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

interface StreamArgs {
  requestId: string;
  modelVersion: string;
  output: string;
  classification: SafetyClassification;
  citations: Citation[];
}

function buildSseStream(args: StreamArgs): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: string, payload: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
        );
      };

      write('meta', {
        requestId: args.requestId,
        modelVersion: args.modelVersion,
      });

      // Chunk the visible output so the UI can render it as a typing stream.
      // This is cosmetic — execute() already returned the full output — but
      // it matches the SSE contract the UI hook expects.
      const chunks = chunkForStream(args.output);
      for (const chunk of chunks) {
        write('token', { text: chunk });
      }

      write('done', {
        classification: args.classification,
        output: args.output,
        citations: args.citations,
      });

      controller.close();
    },
  });
}

function chunkForStream(text: string): string[] {
  if (!text) return [];
  // Word-boundary chunks keep the visible stream natural without introducing
  // timing work in the route handler. The hook is responsible for any
  // visual pacing — we just supply the tokens.
  return text.split(/(\s+)/).filter((chunk) => chunk.length > 0);
}
