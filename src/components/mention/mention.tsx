'use client';

/**
 * Universal node reference chip — a citation that actually goes somewhere.
 *
 * First caller: chat citations (S1 from the chat ↔ record bridge ideation).
 * Before this, `[1] nodeId · chunkId` rendered as dead text. Now it's a
 * button that opens `NodeDetailSheet` — the same sheet topic pages use —
 * so the peek surface stays a single source of truth across chat, topics,
 * insights, and any future AI-authored claim that cites a node.
 *
 * v1 scope:
 *   - No eager hydration. We fetch the node on first click, not on mount,
 *     so a message with ten citations doesn't fire ten requests the user
 *     may never care about.
 *   - No popover. The excerpt itself is the peek; the sheet is the full
 *     read. We keep the surface area small until there's a concrete second
 *     caller to generalise against.
 */

import { useCallback, useState } from 'react';
import { NodeDetailSheet } from '@/components/graph/node-detail-sheet';
import { cn } from '@/lib/utils';
import { defaultNodeCache } from './node-cache';
import { useNode } from './use-node';

interface Props {
  nodeId: string;
  chunkId?: string | null;
  excerpt?: string;
  /** Ordinal shown as `[N]`. Optional — omit for inline mentions without a list position. */
  index?: number;
  className?: string;
}

export function Mention({ nodeId, chunkId, excerpt, index, className }: Props) {
  const [open, setOpen] = useState(false);
  // Only subscribe to the cache while the sheet is (about to be) open — no
  // point holding a listener for every chip on screen.
  const entry = useNode(nodeId, { enabled: open });

  const onClick = useCallback(() => {
    // Touch the cache synchronously so the sheet's first render already sees
    // `loading` → avoids a one-frame `idle` flash.
    defaultNodeCache.load(nodeId);
    setOpen(true);
  }, [nodeId]);

  const label = excerpt ?? nodeId;
  const title =
    excerpt && chunkId ? `${excerpt} · ${chunkId}` : excerpt ?? nodeId;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-haspopup="dialog"
        aria-expanded={open || undefined}
        aria-busy={open && entry?.status === 'loading' ? true : undefined}
        title={title}
        className={cn(
          'inline-flex items-baseline gap-1.5 rounded-full border border-border/60 bg-surface px-2 py-0.5',
          'font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary',
          'hover:border-border-hover hover:bg-surface-sunken hover:text-text-primary',
          'transition-colors duration-300 ease-spring',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
          className,
        )}
      >
        {typeof index === 'number' && <span aria-hidden>[{index}]</span>}
        <span className="font-sans normal-case tracking-normal text-text-secondary">
          {label}
        </span>
      </button>
      <NodeDetailSheet
        node={open && entry?.status === 'ready' ? entry.node : null}
        onClose={() => setOpen(false)}
      />
      {open && entry?.status === 'error' && (
        <MentionError nodeId={nodeId} message={entry.message} onDismiss={() => setOpen(false)} />
      )}
    </>
  );
}

/**
 * Narrow fallback when node hydration fails. We don't want the sheet to open
 * in a permanent loading state, so we render a small alert that the caller
 * can dismiss. This is best-effort — the chip itself stays usable.
 */
function MentionError({
  nodeId,
  message,
  onDismiss,
}: {
  nodeId: string;
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-2 inline-flex items-center gap-2 rounded-card border border-alert/40 bg-surface px-3 py-2 text-caption text-alert"
    >
      <span>
        Couldn&apos;t open {nodeId} — {message}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary hover:text-text-primary"
      >
        Dismiss
      </button>
    </div>
  );
}
