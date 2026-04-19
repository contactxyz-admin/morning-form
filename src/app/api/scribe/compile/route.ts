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
 *   Returns: `TopicCompileResult` (same shape as the GET route) — UI consumers
 *     also resolve `chunkToSource`; agents typically don't need that so this
 *     route omits the extra query.
 *
 * Errors: auth, unknown topic, LLM failures — same mappings as the GET route.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { LLMClient } from '@/lib/llm/client';
import { compileTopic } from '@/lib/topics/compile';
import { getTopicConfig } from '@/lib/topics/registry';
import { TopicCompileLintError } from '@/lib/topics/types';
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
    if (!json) {
      return NextResponse.json(
        { error: 'Invalid JSON body.' },
        { status: 400 },
      );
    }

    const parsed = bodySchema.safeParse(json);
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

async function safeJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
