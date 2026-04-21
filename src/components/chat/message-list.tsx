'use client';

/**
 * Chronological stack of chat bubbles. The parent passes a
 * concatenation of (rehydrated history) + (optimistic user) +
 * (live streaming assistant bubble if active). Autoscrolls the
 * last bubble into view whenever the list grows or the active
 * streaming bubble's content changes.
 */
import { useEffect, useRef } from 'react';
import { MessageBubble, type BubbleModel } from './message-bubble';

interface Props {
  messages: readonly BubbleModel[];
}

export function MessageList({ messages }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastContent = messages.at(-1)?.content ?? '';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, lastContent]);

  return (
    <div className="flex flex-col gap-6">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
