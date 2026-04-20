/**
 * POST /api/chat/send — chat turn SSE endpoint (U4).
 *
 * Wraps `runChatTurn` as a text/event-stream. Events flow directly from
 * the async generator to the SSE wire; there is no pre-completion wait
 * because `runChatTurn` already upholds the D11 invariant internally —
 * the user message is persisted before any yielded event, and the
 * scribe audit row is written by `execute()` before the first `token`
 * event can land on the stream.
 *
 * Contract:
 *   Body: { text: string }   (1..2000 chars, trimmed)
 *   Success: text/event-stream with four event kinds:
 *     - `routed`: { topicKey, confidence, reasoning }
 *     - `token`:  { text }
 *     - `done`:   { classification, output, citations, topicKey, assistantMessageId }
 *     - `error`:  { message }  (mid-stream or pre-routing)
 *   Failure before stream starts: JSON 4xx/5xx.
 *
 * Invariants:
 *   - D10: `userId` comes from the session and is threaded into `runChatTurn`;
 *     the route never trusts a userId from the request body.
 *   - D11: the audit row (for scribe-backed turns) is written by `execute()`
 *     inside `runChatTurn` before the first `token` event yields.
 *   - Rejection-safe surface parity with the Explain SSE route: unsafe
 *     scribe outputs never stream as tokens; `runChatTurn` substitutes
 *     the fallback string before yielding.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { getScribeLLMClient } from '@/lib/scribe/llm';
import { runChatTurn } from '@/lib/chat/turn';
import type { TurnEvent } from '@/lib/chat/types';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

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
        error: 'Invalid chat request.',
        details: err instanceof Error ? err.message : 'parse failed',
      },
      { status: 400 },
    );
  }

  let scribeLlm;
  try {
    scribeLlm = getScribeLLMClient();
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Scribe LLM client is not configured.',
        details: err instanceof Error ? err.message : 'factory failed',
      },
      { status: 503 },
    );
  }

  const turn = runChatTurn({
    db: prisma,
    userId: user.id,
    text: parsed.text,
    scribeLlm,
  });

  const stream = buildSseStream(turn);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function buildSseStream(
  turn: AsyncGenerator<TurnEvent, void, void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: string, payload: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
        );
      };

      try {
        for await (const ev of turn) {
          switch (ev.type) {
            case 'routed':
              write('routed', {
                topicKey: ev.topicKey,
                confidence: ev.confidence,
                reasoning: ev.reasoning,
              });
              break;
            case 'token':
              write('token', { text: ev.text });
              break;
            case 'done':
              write('done', {
                classification: ev.classification,
                output: ev.output,
                citations: ev.citations,
                topicKey: ev.topicKey,
                assistantMessageId: ev.assistantMessageId,
              });
              break;
            case 'error':
              write('error', { message: ev.message });
              break;
          }
        }
      } catch (err) {
        // `runChatTurn` catches its own errors and yields an `error` event,
        // so a throw here means the generator itself malfunctioned — surface
        // it to the stream rather than silently hanging the client.
        write('error', {
          message: err instanceof Error ? err.message : 'chat turn failed',
        });
      } finally {
        controller.close();
      }
    },
  });
}
