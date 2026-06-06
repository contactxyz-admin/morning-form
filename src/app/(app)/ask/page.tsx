'use client';

/**
 * `/ask` — the chat-first health assistant surface.
 *
 * On mount, fetches the last 50 messages via `GET /api/chat/history`
 * and rehydrates the list in chronological order. Users compose via
 * the bottom composer; each submit optimistically appends a user
 * bubble and opens the streaming assistant bubble above the composer.
 *
 * The page reads `?seed=<text>` from the URL to auto-fire a first
 * turn — used by the home-page entry point in U6. Empty/whitespace
 * seeds are ignored so malformed share links don't fire spurious
 * turns.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SafetyClassification } from '@/lib/scribe/policy/types';
import type { Citation } from '@/lib/topics/types';
import type { Referral } from '@/lib/chat/types';
import { MessageList } from '@/components/chat/message-list';
import { Composer } from '@/components/chat/composer';
import { useChatStream } from '@/components/chat/use-chat-stream';
import type {
  AssistantBubbleModel,
  BubbleModel,
  UserBubbleModel,
} from '@/components/chat/message-bubble';
import { LlmConsentModal } from '@/components/auth/llm-consent-modal';
import { useLlmConsentGate } from '@/lib/hooks/use-llm-consent-gate';
import { track } from '@/lib/funnel/track';
import { FUNNEL_EVENTS } from '@/lib/funnel/event';

interface HistoryResponse {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

type HistoryState =
  | { kind: 'loading' }
  | { kind: 'ready'; messages: BubbleModel[] }
  | { kind: 'error'; message: string };

const EMPTY_STATE_COPY = 'Ask anything about your health.';
const SUGGESTION_CHIPS = [
  'What iron results are in my record?',
  'How has my sleep been tracking?',
  'What could be driving my fatigue?',
];

export default function AskPage() {
  // useSearchParams requires a Suspense boundary for static prerendering
  // (Next 14 CSR bailout contract). The inner component reads the seed.
  return (
    <Suspense fallback={<div className="h-full" />}>
      <AskPageInner />
    </Suspense>
  );
}

function AskPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const seed = searchParams?.get('seed') ?? undefined;
  const [history, setHistory] = useState<HistoryState>({ kind: 'loading' });
  const [pendingUser, setPendingUser] = useState<UserBubbleModel | null>(null);

  // Clear `?seed=` from the URL after the composer auto-fires so a
  // remount (back-nav, tab refocus) doesn't re-fire the same turn and
  // create a duplicate ChatMessage row.
  const handleSeedSubmitted = useCallback(() => {
    router.replace('/ask');
  }, [router]);

  const onDone = useCallback(
    (args: {
      text: string;
      topicKey: string | null;
      classification: SafetyClassification;
      citations: Citation[];
      output: string;
      assistantMessageId: string;
      referrals: readonly Referral[];
    }) => {
      setHistory((prev) => {
        if (prev.kind !== 'ready') return prev;
        const assistant: AssistantBubbleModel = {
          role: 'assistant',
          id: args.assistantMessageId,
          content: args.output,
          topicKey: args.topicKey,
          classification: args.classification,
          citations: args.citations,
          referrals: args.referrals,
        };
        return { kind: 'ready', messages: [...prev.messages, assistant] };
      });
      setPendingUser(null);
      pendingOptimisticIdRef.current = null;
    },
    [],
  );

  const consentGate = useLlmConsentGate();
  // Track the optimistic user bubble id pinned to a pending consent turn.
  // On cancel we splice it out so a declined consent doesn't leave a
  // ghost user message with no assistant beneath it.
  const pendingOptimisticIdRef = useRef<string | null>(null);
  const { state: turnState, start: startTurn } = useChatStream({
    onDone,
    onRequiresConsent: consentGate.armRetry,
  });

  // Fetch history on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/chat/history', {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) {
          if (!cancelled) {
            setHistory({ kind: 'error', message: `HTTP ${res.status}` });
          }
          return;
        }
        const body = (await res.json()) as HistoryResponse;
        if (cancelled) return;
        const messages = body.messages.map((m) => toBubble(m)).filter(isBubble);
        setHistory({ kind: 'ready', messages });
      } catch (err) {
        if (!cancelled) {
          setHistory({
            kind: 'error',
            message: err instanceof Error ? err.message : 'network error',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hash-scroll: when navigated to /ask#<messageId>, scroll to and briefly
  // highlight that assistant answer. Phase B U1 — timeline back-link.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (!el) return;
    // Small delay so the DOM has rendered before scrolling.
    const timer = setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-accent/30', 'rounded-card', 'transition-all');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-accent/30');
      }, 2000);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      const optimisticId = `pending-${Date.now()}`;
      pendingOptimisticIdRef.current = optimisticId;
      const optimistic: UserBubbleModel = {
        role: 'user',
        id: optimisticId,
        content: trimmed,
      };
      setPendingUser(optimistic);
      setHistory((prev) => {
        if (prev.kind !== 'ready') return prev;
        // first_ask_sent fires only on the user's very first ask of all
        // time — detected by zero prior user-role messages in history.
        // History was rehydrated from /api/chat/history on mount, so
        // returning users with any past chat won't refire.
        const isFirst = prev.messages.every((m) => m.role !== 'user');
        if (isFirst) {
          track(FUNNEL_EVENTS.FIRST_ASK_SENT, { messageLength: trimmed.length });
        }
        return {
          kind: 'ready',
          messages: [...prev.messages, optimistic],
        };
      });
      startTurn({ text: trimmed });
    },
    [startTurn],
  );

  // The rendered list is the committed history plus — while a turn is
  // in flight — a streaming assistant bubble sitting below the
  // optimistic user bubble.
  const renderedMessages = useMemo<BubbleModel[]>(() => {
    if (history.kind !== 'ready') return [];
    const base = history.messages;
    if (turnState.status === 'idle' || turnState.status === 'done') {
      return base;
    }
    const streaming: AssistantBubbleModel = {
      role: 'assistant',
      id: 'streaming',
      content: turnState.content,
      topicKey: turnState.topicKey,
      classification: turnState.classification,
      citations: turnState.citations,
      referrals: turnState.referrals,
      pending: turnState.status !== 'error',
      error:
        turnState.status === 'error' ? turnState.error ?? 'Stream ended.' : undefined,
    };
    return [...base, streaming];
  }, [history, turnState]);

  const composerDisabled =
    turnState.status === 'opening' || turnState.status === 'streaming';

  const showEmptyState =
    history.kind === 'ready' &&
    history.messages.length === 0 &&
    turnState.status === 'idle' &&
    !pendingUser;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        {history.kind === 'loading' && (
          <p className="text-text-tertiary text-caption">Loading conversation…</p>
        )}
        {history.kind === 'error' && (
          <p className="text-alert text-caption">
            Couldn't load your chat history ({history.message}). Start a new
            conversation below.
          </p>
        )}
        {showEmptyState && (
          <EmptyState
            copy={EMPTY_STATE_COPY}
            suggestions={SUGGESTION_CHIPS}
            onPick={handleSubmit}
          />
        )}
        {history.kind === 'ready' && renderedMessages.length > 0 && (
          <MessageList messages={renderedMessages} />
        )}
      </div>
      <div className="border-t border-border bg-surface px-5 py-4 sm:px-6">
        <Composer
          disabled={composerDisabled}
          onSubmit={handleSubmit}
          initialValue={seed && seed.trim().length > 0 ? seed : undefined}
          onInitialSubmitted={handleSeedSubmitted}
        />
      </div>
      <LlmConsentModal
        open={consentGate.open}
        onAccepted={consentGate.onAccepted}
        onCancel={() => {
          consentGate.onCancel();
          // Roll back the optimistic user bubble pinned to this turn so
          // declined consent doesn't leave an unanswered question in the
          // conversation. The ref is set in handleSubmit and cleared in
          // onDone, so it only fires here when we know the turn never
          // reached the assistant.
          const orphanId = pendingOptimisticIdRef.current;
          pendingOptimisticIdRef.current = null;
          setPendingUser(null);
          if (orphanId) {
            setHistory((prev) => {
              if (prev.kind !== 'ready') return prev;
              return {
                kind: 'ready',
                messages: prev.messages.filter((m) => m.id !== orphanId),
              };
            });
          }
        }}
      />
    </div>
  );
}

function EmptyState({
  copy,
  suggestions,
  onPick,
}: {
  copy: string;
  suggestions: readonly string[];
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6 pt-12">
      <h2 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
        {copy}
      </h2>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-chip border border-border bg-surface px-4 py-2 text-caption text-text-secondary hover:border-border-strong hover:text-text-primary transition-[color,border-color] duration-300 ease-spring"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function toBubble(m: HistoryResponse['messages'][number]): BubbleModel | null {
  if (m.role === 'user') {
    return {
      role: 'user',
      id: m.id,
      content: m.content,
    };
  }
  if (m.role === 'assistant') {
    const meta = m.metadata ?? {};
    return {
      role: 'assistant',
      id: m.id,
      content: m.content,
      topicKey:
        typeof meta.topicKey === 'string'
          ? meta.topicKey
          : meta.topicKey === null
            ? null
            : null,
      classification:
        isSafetyClassification(meta.classification) ? meta.classification : null,
      citations: Array.isArray(meta.citations) ? (meta.citations as Citation[]) : [],
      referrals: Array.isArray(meta.referrals) ? (meta.referrals as Referral[]) : [],
    };
  }
  return null;
}

function isBubble(b: BubbleModel | null): b is BubbleModel {
  return b !== null;
}

function isSafetyClassification(v: unknown): v is SafetyClassification {
  return v === 'clinical-safe' || v === 'out-of-scope-routed' || v === 'rejected';
}
