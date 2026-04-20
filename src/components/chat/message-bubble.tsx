'use client';

/**
 * A single chat bubble. Four rendered variants, driven by role +
 * classification:
 *
 *   - user: right-aligned ink bubble with the user's text.
 *   - assistant streaming: soft bubble, live content, no chip yet.
 *   - assistant clinical-safe: bubble with `SpecialistChip`, citations.
 *   - assistant out-of-scope: GP-prep handoff copy + "Bring to your GP"
 *     framing (the full GPPrepCard integration lives in U6; here we
 *     render the fallback copy with clear out-of-scope intent).
 *   - assistant error: inline "Something went wrong" with retry copy;
 *     the parent is responsible for wiring the actual retry.
 */
import { cn } from '@/lib/utils';
import type { SafetyClassification } from '@/lib/scribe/policy/types';
import type { Citation } from '@/lib/topics/types';
import { SpecialistChip } from './specialist-chip';

export interface UserBubbleModel {
  readonly role: 'user';
  readonly id: string;
  readonly content: string;
}

export interface AssistantBubbleModel {
  readonly role: 'assistant';
  readonly id: string;
  readonly content: string;
  readonly topicKey: string | null;
  readonly classification: SafetyClassification | null;
  readonly citations: readonly Citation[];
  /** True while the stream is still open; the bubble renders a subtle pulse. */
  readonly pending?: boolean;
  /** If set, renders an inline error surface instead of content. */
  readonly error?: string;
}

export type BubbleModel = UserBubbleModel | AssistantBubbleModel;

interface Props {
  message: BubbleModel;
}

export function MessageBubble({ message }: Props) {
  if (message.role === 'user') {
    return <UserBubble content={message.content} />;
  }
  return <AssistantBubble message={message} />;
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          'max-w-[85%] rounded-card bg-button px-4 py-3',
          'text-body text-[#FDFBF6] leading-relaxed',
          'shadow-button-primary',
        )}
      >
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({ message }: { message: AssistantBubbleModel }) {
  if (message.error) {
    return (
      <div className="flex justify-start">
        <div
          className={cn(
            'max-w-[85%] rounded-card border border-alert/30 bg-surface px-4 py-3',
            'text-body text-text-secondary leading-relaxed',
          )}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-alert mb-1">
            Something went wrong
          </p>
          <p>{message.error}</p>
        </div>
      </div>
    );
  }

  const isOutOfScope = message.classification === 'out-of-scope-routed';

  return (
    <div className="flex flex-col items-start gap-2">
      {message.topicKey && !isOutOfScope && (
        <SpecialistChip topicKey={message.topicKey} />
      )}
      {isOutOfScope && (
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          · Outside my scope — bring to your GP
        </p>
      )}

      <div
        className={cn(
          'max-w-[85%] rounded-card border border-border bg-surface px-4 py-3',
          'text-body text-text-primary leading-relaxed',
          message.pending && 'animate-pulse-subtle',
          isOutOfScope && 'bg-surface-warm',
        )}
      >
        {message.content || <span className="text-text-tertiary">…</span>}
      </div>

      {message.citations.length > 0 && (
        <CitationList citations={message.citations} />
      )}
    </div>
  );
}

function CitationList({ citations }: { citations: readonly Citation[] }) {
  return (
    <ol className="mt-1 space-y-1 pl-1">
      {citations.map((c, i) => (
        <li
          key={`${c.nodeId}-${c.chunkId ?? i}`}
          className="flex gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary"
        >
          <span>[{i + 1}]</span>
          <span className="font-sans text-caption normal-case tracking-normal text-text-secondary">
            {c.nodeId}
            {c.chunkId ? ` · ${c.chunkId}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}
