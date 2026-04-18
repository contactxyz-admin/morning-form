'use client';

/**
 * `InlineExplainCard` — floating card that streams the scribe's response
 * inline. Draggable by its header, fixed to `bottom-24` on first mount so
 * it doesn't occlude the selection that triggered it.
 *
 * Rejection-safe surface: when the final classification is `rejected` or
 * `out-of-scope-routed`, the card shows the fallback copy (already
 * substituted on the server, per D2), rendered with an `alert` kicker and
 * no citations. The user never sees the suppressed raw output.
 *
 * There is no "Continue in Scribe" affordance (D8) — the card ends at the
 * disclaimer and the close button. The scribe is bounded in scope, not a
 * chat surface.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Disclaimer } from '@/components/ui/disclaimer';
import { SectionLabel } from '@/components/ui/section-label';
import { cn } from '@/lib/utils';
import type { ExplainState } from './use-explain-stream';

export interface InlineExplainCardProps {
  state: ExplainState;
  onClose: () => void;
  onCitationClick?: (nodeId: string) => void;
}

interface Position {
  x: number;
  y: number;
}

export function InlineExplainCard({
  state,
  onClose,
  onCitationClick,
}: InlineExplainCardProps) {
  const [offset, setOffset] = useState<Position>({ x: 0, y: 0 });
  const dragOriginRef = useRef<Position | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Escape closes the card — keyboard parity required by U5 test scenarios.
  useEffect(() => {
    const handleKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    dragOriginRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [offset]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragOriginRef.current) return;
    setOffset({
      x: e.clientX - dragOriginRef.current.x,
      y: e.clientY - dragOriginRef.current.y,
    });
  }, []);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    dragOriginRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const rejected =
    state.classification === 'rejected' ||
    state.classification === 'out-of-scope-routed';

  const kicker = rejected
    ? 'Out of scope'
    : state.status === 'done'
      ? 'Scribe'
      : 'Scribe · streaming';

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Inline explanation"
      className={cn(
        'fixed left-1/2 bottom-24 z-50 w-[min(24rem,calc(100vw-2rem))]',
        'max-w-sm rounded-card border border-border-strong bg-surface shadow-modal',
        'overflow-hidden',
      )}
      style={{
        transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`,
      }}
    >
      {/* Header — drag handle + close */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <SectionLabel>{kicker}</SectionLabel>
        <button
          type="button"
          aria-label="Close explanation"
          className="text-text-tertiary hover:text-text-primary p-1 rounded-full focus-visible:outline-none focus-visible:shadow-ring-focus"
          onClick={onClose}
        >
          <Icon name="close" size="sm" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {state.status === 'opening' && (
          <p className="text-body text-text-tertiary italic">Thinking…</p>
        )}

        {state.status === 'error' && (
          <p className="text-body text-text-secondary">
            {state.error ?? 'Something went wrong.'}
          </p>
        )}

        {(state.status === 'streaming' || state.status === 'done') && (
          <p
            className={cn(
              'text-body text-text-primary whitespace-pre-wrap leading-relaxed',
              rejected && 'text-text-secondary',
            )}
          >
            {state.content}
            {state.status === 'streaming' && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-text-tertiary align-middle animate-pulse" />
            )}
          </p>
        )}

        {state.status === 'done' && state.citations.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {state.citations.map((c) => (
              <button
                key={`${c.nodeId}:${c.chunkId ?? ''}`}
                type="button"
                onClick={() => onCitationClick?.(c.nodeId)}
                className="inline-flex items-center rounded-full border border-border bg-surface-warm px-2.5 py-0.5 text-caption text-text-secondary hover:border-text-primary hover:text-text-primary focus-visible:outline-none focus-visible:shadow-ring-focus"
              >
                {c.excerpt ? truncate(c.excerpt, 40) : c.nodeId}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer — persistent disclaimer (R18). */}
      <div className="px-4 py-3 border-t border-border bg-surface-warm">
        <Disclaimer variant="topic" />
      </div>
    </div>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}
