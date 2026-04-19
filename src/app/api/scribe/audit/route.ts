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
 * `listAudits` filters by `userId` and validates cursor ownership before
 * Prisma's keyset lookup — there is no shape of this request that can
 * reach another user's audits, and no way to distinguish a non-existent
 * audit id from another user's audit id (both return 400 "Invalid cursor").
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import {
  InvalidAuditCursorError,
  LIST_AUDITS_MAX_LIMIT,
  listAudits,
} from '@/lib/scribe/repo';
import { getTopicConfig } from '@/lib/topics/registry';
import type { SafetyClassification } from '@/lib/scribe/policy/types';

const safetyClassificationSchema = z.enum([
  'clinical-safe',
  'out-of-scope-routed',
  'rejected',
]);

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
    // An unknown `topicKey` returns 404 rather than an empty list so that
    // legitimate callers catch typos early. The topic registry is already
    // public (topic keys appear in the GET `/api/topics/:key` URL space),
    // so there is no registry-enumeration surface to protect here.
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
      // Parse rather than cast — the column is plain `String` in Prisma, so
      // a direct `as SafetyClassification` would silently project whatever
      // value the DB holds. A failed parse is a louder failure than a
      // wrong-looking row served through the regulatory audit trail.
      safetyClassification: safetyClassificationSchema.parse(
        r.safetyClassification,
      ),
      modelVersion: r.modelVersion,
      output: r.output,
      prompt: r.prompt,
      toolCalls: safeParseJson(r.toolCalls),
      citations: safeParseJson(r.citations),
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ rows: projected, nextCursor });
  } catch (err) {
    if (err instanceof InvalidAuditCursorError) {
      return NextResponse.json(
        { error: 'Invalid cursor.' },
        { status: 400 },
      );
    }
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
