/**
 * POST /api/scribe/compile — agent-native recompile trigger.
 *
 * Mirrors the force-recompile path already reachable through
 * `GET /api/topics/[topicKey]?force=1`, but lives in the `/api/scribe`
 * namespace so agents see a first-class action verb ("POST to trigger")
 * alongside `/api/scribe/explain` and `/api/scribe/audit` (U6).
 *
 * Contract:
 *   Body: `{ topicKey: string }`
 *   Auth: session cookie, `getCurrentUser()`
 *   Returns: `TopicCompileResult` + `displayName`. This is a subset of the
 *     GET route's response — the GET route additionally resolves
 *     `chunkToSource` for UI citation linkage. Agents don't need that so
 *     this route omits it to keep the response narrow.
 *
 * Errors: auth, unknown topic, LLM failures, audit-write failures — same
 * mappings as the GET route and `/api/scribe/explain`.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { LLMClient } from '@/lib/llm/client';
import { compileTopic } from '@/lib/topics/compile';
import { getTopicConfig } from '@/lib/topics/registry';
import { TopicCompileLintError } from '@/lib/topics/types';
import { ScribeAuditWriteError } from '@/lib/scribe/repo';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMTransientError,
  LLMValidationError,
} from '@/lib/llm/errors';

export const dynamic = 'force-dynamic';
// Same rationale as `GET /api/topics/[topicKey]`: compile can fire two
// sequential LLM calls, each up to 90 s, plus DB + source resolution.
export const maxDuration = 300;

const bodySchema = z.object({
  topicKey: z.string().min(1).max(64),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 },
      );
    }

    const json = await safeJson(request);
    if (!json.ok) {
      return NextResponse.json(
        { error: 'Invalid JSON body.' },
        { status: 400 },
      );
    }

    const parsed = bodySchema.safeParse(json.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body.', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { topicKey } = parsed.data;
    const config = getTopicConfig(topicKey);
    if (!config) {
      return NextResponse.json({ error: 'Unknown topic.' }, { status: 404 });
    }

    const llm = new LLMClient();
    const result = await compileTopic({
      db: prisma,
      llm,
      userId: user.id,
      topicKey,
      force: true,
    });

    return NextResponse.json({
      ...result,
      displayName: config.displayName,
    });
  } catch (err) {
    if (err instanceof TopicCompileLintError) {
      return NextResponse.json(
        {
          error: 'Compile failed validation after retry.',
          violations: err.violations,
        },
        { status: 422 },
      );
    }
    // ScribeAuditWriteError is load-bearing for D11 (audit-before-gate). If
    // the audit row write fails the route must surface it distinctly so the
    // caller can distinguish a regulatory-trail gap from a compile error.
    if (err instanceof ScribeAuditWriteError) {
      console.error('[API] scribe compile audit write error:', err);
      return NextResponse.json(
        { error: 'Audit write failed.', details: err.message },
        { status: 500 },
      );
    }
    if (err instanceof LLMAuthError) {
      console.error('[API] scribe compile LLM auth error:', err);
      return NextResponse.json(
        { error: 'Upstream auth failure.' },
        { status: 502 },
      );
    }
    if (err instanceof LLMRateLimitError || err instanceof LLMTransientError) {
      return NextResponse.json(
        { error: 'Upstream busy, try again.' },
        { status: 503 },
      );
    }
    if (err instanceof LLMValidationError) {
      return NextResponse.json(
        { error: 'Compile output failed validation.' },
        { status: 502 },
      );
    }
    console.error('[API] scribe compile error:', err);
    return NextResponse.json(
      { error: 'Failed to compile topic.' },
      { status: 500 },
    );
  }
}

// Tagged result so that valid-but-falsy JSON bodies (`null`, `false`, `0`, `""`)
// are not misdiagnosed as parse failures. A JSON parse error is a distinct
// outcome from a parsed body that happens to be falsy.
async function safeJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}
