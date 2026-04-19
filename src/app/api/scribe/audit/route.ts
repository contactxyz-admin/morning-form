/**
 * GET /api/scribe/audit — paginated audit trail, scoped to the caller.
 *
 * Returns `ScribeAudit` rows the signed-in user owns, newest first, at most
 * 50 per page. Enables agents (and future clinical-review UIs) to walk the
 * regulatory trail without bypassing the same user scoping that the UI and
 * share surfaces enforce (D6/D10).
 *
 * Query params:
 *   `cursor?` — id of the last row from the previous page; omit for page 1.
 *   `limit?` — requested page size; clamped to [1, 50] server-side.
 *   `topicKey?` — optional filter (same `topicKey` validated against the
 *     topic registry so an unknown value can't be used as a probe).
 *
 * Returns `{ rows: AuditRow[], nextCursor: string | null }`. `rows` is a
 * projection — the raw DB model stores `toolCalls` and `citations` as JSON
 * strings; we parse them before responding so agents don't need to handle
 * the storage encoding. Cross-user rows are structurally invisible because
 * `listAudits` filters by `userId` — there is no shape of this request that
 * can reach another user's audits, so a "cross-user 404" is the natural
 * consequence rather than an explicit check.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { listAudits, LIST_AUDITS_MAX_LIMIT } from '@/lib/scribe/repo';
import { getTopicConfig } from '@/lib/topics/registry';
import type { SafetyClassification } from '@/lib/scribe/policy/types';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(LIST_AUDITS_MAX_LIMIT).optional(),
  topicKey: z.string().min(1).max(64).optional(),
});

interface AuditRow {
  id: string;
  topicKey: string;
  mode: string;
  requestId: string;
  safetyClassification: SafetyClassification;
  modelVersion: string;
  output: string;
  prompt: string;
  toolCalls: unknown;
  citations: unknown;
  createdAt: string;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      topicKey: url.searchParams.get('topicKey') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query.', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { cursor, limit, topicKey } = parsed.data;
    // An unknown `topicKey` shouldn't surface a probeable 404 — treat it as a
    // filter that matches nothing. But validating against the registry is
    // still cheap and surfaces typos for legitimate callers.
    if (topicKey && !getTopicConfig(topicKey)) {
      return NextResponse.json({ error: 'Unknown topic.' }, { status: 404 });
    }

    const { rows, nextCursor } = await listAudits(prisma, user.id, {
      cursor: cursor ?? null,
      limit,
      topicKey: topicKey ?? null,
    });

    const projected: AuditRow[] = rows.map((r) => ({
      id: r.id,
      topicKey: r.topicKey,
      mode: r.mode,
      requestId: r.requestId,
      safetyClassification: r.safetyClassification as SafetyClassification,
      modelVersion: r.modelVersion,
      output: r.output,
      prompt: r.prompt,
      toolCalls: safeParseJson(r.toolCalls),
      citations: safeParseJson(r.citations),
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ rows: projected, nextCursor });
  } catch (err) {
    console.error('[API] scribe audit list error:', err);
    return NextResponse.json(
      { error: 'Failed to list audits.' },
      { status: 500 },
    );
  }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
