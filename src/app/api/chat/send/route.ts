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
 *     - `routed`: { topicKey: string | null, confidence: number }
 *                 (null topicKey means out-of-scope)
 *     - `token`:  { text }
 *     - `done`:   { classification, output, citations, topicKey: string | null,
 *                   assistantMessageId, requestId, auditId: string | null }
 *                 (requestId/auditId absent on the out-of-scope path because
 *                 it doesn't hit the scribe; the topic-key fallback path still
 *                 returns `assistantMessageId` so history replay joins work)
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

/**
 * Wall-clock budget for a single chat turn. A scribe run can retry the LLM
 * adapter up to 3× per Anthropic turn and iterate up to 7 tool-use turns —
 * an unbounded turn could occupy a server for many minutes per user. This
 * cap is combined with `req.signal` (client disconnect) so either source
 * cuts the generator cleanly and records a `rejected` audit row.
 */
const TURN_BUDGET_MS = 90_000;

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

  // Combine client-disconnect and wall-clock budget. Either abort source
  // lands in the generator's cancellation checks; `buildSseStream`'s
  // `cancel()` also fires the local controller if the client disconnects
  // before any abort upstream has fired.
  const turnController = new AbortController();
  const signal = AbortSignal.any([
    req.signal,
    AbortSignal.timeout(TURN_BUDGET_MS),
    turnController.signal,
  ]);

  const turn = runChatTurn({
    db: prisma,
    userId: user.id,
    text: parsed.text,
    scribeLlm,
    signal,
  });

  const stream = buildSseStream(turn, turnController);

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
  turnController: AbortController,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
          );
        } catch {
          // Controller already closed (client disconnect); swallow.
          closed = true;
        }
      };

      try {
        for await (const ev of turn) {
          switch (ev.type) {
            case 'routed':
              // `routed.reasoning` is deliberately audit-only and not
              // shipped to the client (M4). The server persists it on
              // the user message metadata in runChatTurn.
              write('routed', {
                topicKey: ev.topicKey,
                confidence: ev.confidence,
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
                requestId: ev.requestId,
                auditId: ev.auditId,
                referrals: ev.referrals,
              });
              break;
            case 'error':
              write('error', { message: ev.message });
              break;
          }
          if (closed) break;
        }
      } catch (err) {
        // `runChatTurn` catches its own errors and yields an `error` event,
        // so a throw here means the generator itself malfunctioned — surface
        // it to the stream rather than silently hanging the client.
        write('error', {
          message: err instanceof Error ? err.message : 'chat turn failed',
        });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed; ignore.
        }
      }
    },
    cancel() {
      // Client disconnected before the generator terminated. Fire our
      // local controller so `runChatTurn`'s signal-check short-circuits
      // the next yield and the downstream scribe loop stops.
      closed = true;
      turnController.abort();
    },
  });
}
