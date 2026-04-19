'use client';

/**
 * `useExplainStream` — client-side driver for `POST /api/scribe/explain`.
 *
 * The route emits SSE with three event kinds: `meta`, `token`, and `done`.
 * We use `fetch` + streaming reader rather than `EventSource` because
 * EventSource can't POST a body.
 *
 * The hook exposes one `start({ topicKey, selection })` method and a
 * read-only status object. Calling `start` again while a stream is in
 * flight aborts the previous one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SafetyClassification } from '@/lib/scribe/policy/types';
import type { Citation } from '@/lib/topics/types';

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes — still shape-compatible with the server's
  // uuid() validator (z.string().uuid()). Not cryptographically strong;
  // never used in modern browsers or Node >= 19.
  const hex = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0'),
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

export type ExplainStatus =
  | 'idle'
  | 'opening'
  | 'streaming'
  | 'done'
  | 'error';

export interface ExplainState {
  status: ExplainStatus;
  content: string;
  classification: SafetyClassification | null;
  citations: Citation[];
  error: string | null;
}

export interface StartArgs {
  topicKey: string;
  selection: string;
}

interface SseEvent {
  event: string;
  data: unknown;
}

const INITIAL: ExplainState = {
  status: 'idle',
  content: '',
  classification: null,
  citations: [],
  error: null,
};

export function useExplainStream() {
  const [state, setState] = useState<ExplainState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  // Ensure any in-flight stream is cancelled when the hook unmounts — leaving
  // a reader attached would keep the response alive and, more importantly,
  // fire a state update on an unmounted component.
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

  const start = useCallback(async ({ topicKey, selection }: StartArgs) => {
    // Cancel any in-flight stream before opening a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Client-generated requestId makes idempotency a real user-facing
    // contract, not just a test seam: if the user fires two Explain calls
    // with identical intent (double-click the popover, lose connection and
    // retry), the server's upsert folds them into one audit row.
    const requestId = generateRequestId();

    setState({
      status: 'opening',
      content: '',
      classification: null,
      citations: [],
      error: null,
    });

    try {
      const res = await fetch('/api/scribe/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicKey, selection, requestId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = await safeReadJson(res);
        setState({
          status: 'error',
          content: '',
          classification: null,
          citations: [],
          error: detail?.error ?? `HTTP ${res.status}`,
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedContent = '';

      // Streaming state is held locally — each event updates React state in
      // one pass so React can batch as many updates as it wants.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = takeCompleteFrames(buffer);
        buffer = frames.remaining;

        for (const evt of frames.events) {
          if (evt.event === 'meta') {
            setState((prev) => ({ ...prev, status: 'streaming' }));
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
            };
            setState({
              status: 'done',
              content: d.output,
              classification: d.classification,
              citations: d.citations ?? [],
              error: null,
            });
          } else if (evt.event === 'error') {
            const d = evt.data as { error?: string };
            setState({
              status: 'error',
              content: streamedContent,
              classification: null,
              citations: [],
              error: d.error ?? 'Stream error.',
            });
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        // Not an error from the user's point of view — cancelled.
        return;
      }
      setState({
        status: 'error',
        content: '',
        classification: null,
        citations: [],
        error: err instanceof Error ? err.message : 'Network error.',
      });
    }
  }, []);

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

function takeCompleteFrames(
  buffer: string,
): { events: SseEvent[]; remaining: string } {
  const events: SseEvent[] = [];
  let rest = buffer;
  let idx = rest.indexOf('\n\n');
  while (idx !== -1) {
    const frame = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    // SSE spec allows multiple `data:` lines per frame — the decoded
    // payload is their newline-joined concatenation. The route currently
    // emits one line but we tolerate the full spec so a future wire change
    // doesn't silently drop tokens.
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
        });
      } catch {
        // Malformed frame — skip; upstream sends valid JSON, so this is a
        // defensive guard rather than a real code path.
      }
    }
    idx = rest.indexOf('\n\n');
  }
  return { events, remaining: rest };
}
