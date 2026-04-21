/**
 * SSE parsing for `/api/chat/send`.
 *
 * Separated from `useChatStream` (the React wiring) so the parse logic is
 * testable in a node-only environment. The hook pipes bytes from `fetch`
 * through `takeCompleteFrames` and hands the emitted events to React
 * state updates.
 *
 * Tolerant to:
 *   - Frame boundaries that land mid-UTF-8 sequence (TextDecoder
 *     handles that upstream; we only split on `\n\n`).
 *   - Multiple `data:` lines per frame (SSE spec — joined with newlines).
 *   - Malformed JSON payloads (skipped, not thrown).
 *   - Frames missing `event:` or `data:` (skipped).
 */

import type { SafetyClassification } from '@/lib/scribe/policy/types';
import type { Citation } from '@/lib/topics/types';

export interface RoutedSseEvent {
  readonly event: 'routed';
  readonly data: {
    readonly topicKey: string | null;
    readonly confidence: number;
    readonly reasoning: string;
  };
}

export interface TokenSseEvent {
  readonly event: 'token';
  readonly data: { readonly text: string };
}

export interface DoneSseEvent {
  readonly event: 'done';
  readonly data: {
    readonly classification: SafetyClassification;
    readonly output: string;
    readonly citations: readonly Citation[];
    readonly topicKey: string | null;
    readonly assistantMessageId: string;
  };
}

export interface ErrorSseEvent {
  readonly event: 'error';
  readonly data: { readonly message: string };
}

export type ChatSseEvent =
  | RoutedSseEvent
  | TokenSseEvent
  | DoneSseEvent
  | ErrorSseEvent
  | { readonly event: string; readonly data: unknown };

export function takeCompleteFrames(
  buffer: string,
): { events: ChatSseEvent[]; remaining: string } {
  const events: ChatSseEvent[] = [];
  let rest = buffer;
  let idx = rest.indexOf('\n\n');
  while (idx !== -1) {
    const frame = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let eventName: string | null = null;
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      const eMatch = line.match(/^event:\s*(.+)$/);
      if (eMatch) {
        eventName = eMatch[1].trim();
        continue;
      }
      const dMatch = line.match(/^data:\s*(.*)$/);
      if (dMatch) {
        dataLines.push(dMatch[1]);
      }
    }
    if (eventName !== null && dataLines.length > 0) {
      try {
        events.push({
          event: eventName,
          data: JSON.parse(dataLines.join('\n')),
        } as ChatSseEvent);
      } catch {
        // Defensive: malformed payload — skip.
      }
    }
    idx = rest.indexOf('\n\n');
  }
  return { events, remaining: rest };
}

/**
 * Consume a full `Response` body and yield parsed SSE events. The reader
 * is released on completion or abort. Handles partial UTF-8 chunks via
 * TextDecoder stream mode.
 */
export async function* readChatStream(
  res: Response,
): AsyncGenerator<ChatSseEvent, void, void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = takeCompleteFrames(buffer);
      buffer = remaining;
      for (const ev of events) yield ev;
    }
    // Flush any trailing complete frame (unlikely — the server always
    // terminates each frame with `\n\n`, so this is defensive).
    buffer += decoder.decode();
    const { events } = takeCompleteFrames(buffer);
    for (const ev of events) yield ev;
  } finally {
    reader.releaseLock();
  }
}
