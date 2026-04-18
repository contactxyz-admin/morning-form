import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { LLMClient } from '@/lib/llm/client';
import { compileTopic } from '@/lib/topics/compile';
import { getTopicConfig } from '@/lib/topics/registry';
import { TopicCompileLintError, type TopicCompiledOutput } from '@/lib/topics/types';
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
// `compileTopic` can issue up to two sequential LLM calls (primary + one
// remedial retry), and `PER_ATTEMPT_TIMEOUT_MS` is 90 s. A 90 s function
// ceiling would 504 on any slow first attempt before the remedial retry
// could run. Vercel Pro caps at 300 s; leave headroom for DB write + source
// resolution after compile.
export const maxDuration = 300;

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

    const chunkToSource = await resolveChunkToSource(user.id, result.output);

    return NextResponse.json({
      ...result,
      displayName: config.displayName,
      chunkToSource,
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

/**
 * Collect every non-null chunkId across the compiled citations and resolve
 * each to its SourceDocument id, scoped to the caller. Powers the "View
 * source" link next to each citation in `<ThreeTierSection />`. Skipped
 * when compile produced no output (stub/error), returning an empty map.
 */
async function resolveChunkToSource(
  userId: string,
  output: TopicCompiledOutput | null,
): Promise<Record<string, string>> {
  if (!output) return {};
  const chunkIds = new Set<string>();
  for (const section of [
    output.understanding,
    output.whatYouCanDoNow,
    output.discussWithClinician,
  ]) {
    for (const citation of section.citations) {
      if (citation.chunkId) chunkIds.add(citation.chunkId);
    }
  }
  if (chunkIds.size === 0) return {};

  const chunks = await prisma.sourceChunk.findMany({
    where: {
      id: { in: Array.from(chunkIds) },
      sourceDocument: { userId },
    },
    select: { id: true, sourceDocumentId: true },
  });

  const map: Record<string, string> = {};
  for (const c of chunks) map[c.id] = c.sourceDocumentId;
  return map;
}
