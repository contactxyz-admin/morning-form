import { NextRequest, NextResponse } from 'next/server';
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

/**
 * GET /api/topics/[topicKey]
 *
 * Compile-or-cache for a topic page. Returns:
 *   { topicKey, status, graphRevisionHash, cached, output | null, errorMessage? }
 *
 * Status "full" means `output` is the three-tier compiled content.
 * Status "stub" means the graph lacks evidence — UI shows an empty-state.
 * Status "error" means the last compile failed — UI shows a retry affordance.
 *
 * `?force=1` bypasses the graph-revision cache and forces recompile.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function GET(
  req: NextRequest,
  { params }: { params: { topicKey: string } },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const topicKey = params.topicKey;
    const config = getTopicConfig(topicKey);
    if (!config) {
      return NextResponse.json({ error: 'Unknown topic.' }, { status: 404 });
    }

    const force = req.nextUrl.searchParams.get('force') === '1';
    const llm = new LLMClient();
    const result = await compileTopic({
      db: prisma,
      llm,
      userId: user.id,
      topicKey,
      force,
    });

    return NextResponse.json({ ...result, displayName: config.displayName });
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
      console.error('[API] topic compile LLM auth error:', err);
      return NextResponse.json({ error: 'Upstream auth failure.' }, { status: 502 });
    }
    if (err instanceof LLMRateLimitError || err instanceof LLMTransientError) {
      return NextResponse.json({ error: 'Upstream busy, try again.' }, { status: 503 });
    }
    if (err instanceof LLMValidationError) {
      return NextResponse.json({ error: 'Compile output failed validation.' }, { status: 502 });
    }
    console.error('[API] topic compile error:', err);
    return NextResponse.json({ error: 'Failed to compile topic.' }, { status: 500 });
  }
}
