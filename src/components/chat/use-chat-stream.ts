'use client';

/**
 * `useChatStream` — client-side driver for `POST /api/chat/send`.
 *
 * The route emits SSE with four event kinds: `routed`, `token`, `done`, and
 * `error`. We use `fetch` + streaming reader rather than `EventSource`
 * because EventSource can't POST a body. The SSE parsing itself lives in
 * `./chat-stream.ts` so it's unit-testable without a DOM.
 *
 * This hook drives ONE turn's assistant half — the parent owns the
 * `messages[]` list and appends the finalized turn from the hook's `onDone`
 * callback. Status transitions:
 *
 *   idle → opening (fetch started)
 *        → streaming (first `routed`/`token` event)
 *        → done (terminal, via `done` SSE event)
 *        → error (terminal, via `error` SSE event or network/abort)
 *
 * Calling `start` while a turn is in flight aborts the previous one — the
 * stale `onDone` callback never fires.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SafetyClassification } from '@/lib/scribe/policy/types';
import type { Citation } from '@/lib/topics/types';
import { readChatStream } from './chat-stream';

export type ChatTurnStatus =
  | 'idle'
  | 'opening'
  | 'streaming'
  | 'done'
  | 'error';

export interface ChatTurnState {
  status: ChatTurnStatus;
  content: string;
  topicKey: string | null;
  confidence: number | null;
  classification: SafetyClassification | null;
  citations: Citation[];
  assistantMessageId: string | null;
  error: string | null;
}

export interface DoneCallbackArgs {
  text: string;
  topicKey: string | null;
  classification: SafetyClassification;
  citations: Citation[];
  output: string;
  assistantMessageId: string;
}

const INITIAL: ChatTurnState = {
  status: 'idle',
  content: '',
  topicKey: null,
  confidence: null,
  classification: null,
  citations: [],
  assistantMessageId: null,
  error: null,
};

export interface UseChatStreamArgs {
  onDone?: (args: DoneCallbackArgs) => void;
  fetchImpl?: typeof fetch;
}

export function useChatStream(args: UseChatStreamArgs = {}) {
  const { onDone, fetchImpl } = args;
  const [state, setState] = useState<ChatTurnState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  const start = useCallback(
    async ({ text }: { text: string }) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ ...INITIAL, status: 'opening' });

      const doFetch = fetchImpl ?? fetch;
      try {
        const res = await doFetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const detail = await safeReadJson(res);
          setState({
            ...INITIAL,
            status: 'error',
            error: detail?.error ?? `HTTP ${res.status}`,
          });
          return;
        }

        let streamedContent = '';
        for await (const evt of readChatStream(res)) {
          if (controller.signal.aborted) return;
          if (evt.event === 'routed') {
            const d = evt.data as {
              topicKey: string | null;
              confidence: number;
            };
            setState((prev) => ({
              ...prev,
              status: 'streaming',
              topicKey: d.topicKey,
              confidence: d.confidence,
            }));
          } else if (evt.event === 'token') {
            const t = (evt.data as { text?: string }).text ?? '';
            streamedContent += t;
            const snapshot = streamedContent;
            setState((prev) => ({
              ...prev,
              status: 'streaming',
              content: snapshot,
            }));
          } else if (evt.event === 'done') {
            const d = evt.data as {
              classification: SafetyClassification;
              output: string;
              citations: Citation[];
              topicKey: string | null;
              assistantMessageId: string;
            };
            setState({
              status: 'done',
              content: d.output,
              topicKey: d.topicKey,
              confidence: null,
              classification: d.classification,
              citations: d.citations ?? [],
              assistantMessageId: d.assistantMessageId,
              error: null,
            });
            onDoneRef.current?.({
              text: trimmed,
              topicKey: d.topicKey,
              classification: d.classification,
              citations: d.citations ?? [],
              output: d.output,
              assistantMessageId: d.assistantMessageId,
            });
          } else if (evt.event === 'error') {
            const d = evt.data as { message?: string };
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: d.message ?? 'Stream error.',
            }));
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') {
          // Two abort sources: (1) a superseding `start()` call —
          // `abortRef.current` now points at the new controller and
          // the new turn has already set state to `'opening'`; we
          // must not stomp it. (2) unmount or `reset()` — recover
          // to idle so the composer re-enables instead of sticking
          // in `'opening'`.
          if (abortRef.current === controller) {
            setState(INITIAL);
          }
          return;
        }
        setState({
          ...INITIAL,
          status: 'error',
          error: err instanceof Error ? err.message : 'Network error.',
        });
      }
    },
    [fetchImpl],
  );

  return { state, start, reset };
}

async function safeReadJson(
  res: Response,
): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return null;
  }
}
