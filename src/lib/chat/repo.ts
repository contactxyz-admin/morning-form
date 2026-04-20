/**
 * ChatMessage persistence helpers.
 *
 * The `metadata` column is a JSON-encoded string in the DB. We stringify
 * on write and parse-with-fallback on read — a corrupted or older
 * metadata blob degrades to `null` rather than blowing up a history
 * render. The loose typing at the edge is intentional; the strict
 * `UserMessageMetadata` / `AssistantMessageMetadata` shapes in
 * `./types.ts` describe what callers write, not what they must accept.
 */

import type { ChatMessage } from '@prisma/client';
import type { Db } from '@/lib/scribe/tools/types';
import type {
  AssistantMessageMetadata,
  UserMessageMetadata,
} from './types';

export type ChatRole = 'user' | 'assistant';

export const DEFAULT_HISTORY_LIMIT = 10;

export async function createChatMessage(
  db: Db,
  userId: string,
  role: ChatRole,
  content: string,
  metadata?: UserMessageMetadata | AssistantMessageMetadata,
): Promise<ChatMessage> {
  return db.chatMessage.create({
    data: {
      userId,
      role,
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

export async function updateChatMessageMetadata(
  db: Db,
  messageId: string,
  metadata: UserMessageMetadata | AssistantMessageMetadata,
): Promise<void> {
  await db.chatMessage.update({
    where: { id: messageId },
    data: { metadata: JSON.stringify(metadata) },
  });
}

/**
 * Return the last `limit` messages for a user, in chronological order
 * (oldest → newest). The DB read sorts by `createdAt desc` for the
 * `take` cheap path and we re-reverse in memory.
 */
export async function loadRecentMessages(
  db: Db,
  userId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<ChatMessage[]> {
  const rows = await db.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.reverse();
}

/**
 * Parse a metadata JSON string. Returns `null` if the string is null,
 * empty, or unparseable — callers should treat a null return as
 * "no structured metadata" rather than "metadata absent", since an
 * older message may predate the current schema.
 */
export function parseMessageMetadata(
  metadata: string | null,
): Record<string, unknown> | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
