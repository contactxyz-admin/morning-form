/**
 * GET /api/chat/history — last-N chat messages for the signed-in user (U4).
 *
 * Returns a chronological slice (oldest → newest) of the signed-in user's
 * chat history with decoded metadata JSON. MVP caps at 50 messages — the
 * UI renders all of them on mount. Pagination lives in a later unit.
 *
 * Contract:
 *   Success: 200 { messages: Array<{ id, role, content, metadata, createdAt }> }
 *   Failure: 401 JSON if unauthenticated.
 *
 * D10 boundary: the userId always comes from the session, never from the
 * query string.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { loadRecentMessages, parseMessageMetadata } from '@/lib/chat/repo';

export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 50;

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const rows = await loadRecentMessages(prisma, user.id, HISTORY_LIMIT);

  const messages = rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    metadata: parseMessageMetadata(m.metadata),
    createdAt: m.createdAt.toISOString(),
  }));

  return NextResponse.json({ messages });
}
