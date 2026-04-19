'use client';

/**
 * `SelectionPopover` — appears above the current text selection inside any
 * wrapped prose container. v1 exposes a single action: "Explain".
 *
 * Ported from seam's `SelectionPopover.tsx` and adapted to our design
 * tokens. The popover is positioned relative to the selection's bounding
 * rect, clamped to the viewport so it never clips on edges.
 *
 * Keyboard parity (R7 / U5 test scenario): the popover button is a real
 * `<button>` — Tab reaches it, Enter triggers it, and Escape dismisses the
 * popover before focus leaks back to the surrounding text.
 */
import { useCallback, useEffect, useState } from 'react';

interface Rect {
  top: number;
  left: number;
}

interface SelectionInfo {
  text: string;
  rect: Rect;
}

export interface SelectionPopoverProps {
  /**
   * Ref to the prose container we listen to. Selections outside the container
   * (or spanning out of it) are ignored — the popover only surfaces for prose
   * the topic page actually owns.
   */
  containerRef: React.RefObject<HTMLElement | null>;
  onExplain: (selection: string) => void;
}

const MIN_SELECTION_LENGTH = 8;

export function SelectionPopover({
  containerRef,
  onExplain,
}: SelectionPopoverProps) {
  const [info, setInfo] = useState<SelectionInfo | null>(null);

  const clear = useCallback(() => setInfo(null), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setInfo(null);
        return;
      }
      const range = selection.getRangeAt(0);
      // Only surface if the selection is entirely inside the prose container.
      if (!container.contains(range.commonAncestorContainer)) {
        setInfo(null);
        return;
      }
      const text = selection.toString().trim();
      if (text.length < MIN_SELECTION_LENGTH) {
        setInfo(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setInfo(null);
        return;
      }
      setInfo({
        text,
        rect: {
          top: rect.top - 8,
          left: rect.left + rect.width / 2,
        },
      });
    };

    const handleKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') clear();
    };

    const handleScroll = () => setInfo(null);

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [containerRef, clear]);

  if (!info) return null;

  return (
    <div
      role="dialog"
      aria-label="Explain selection"
      // `fixed` uses viewport coordinates directly (same frame as the
      // selection rect). An `absolute` popover would anchor to the nearest
      // positioned ancestor, which may not be the prose container the user
      // selected in. Scrolling dismisses the popover (see scroll listener
      // below) so stale positions are not a concern.
      className="fixed z-40 -translate-x-1/2 -translate-y-full rounded-card border border-border-strong bg-surface shadow-modal"
      style={{ top: info.rect.top, left: info.rect.left }}
      onMouseDown={(e) => {
        // Prevent the browser from collapsing the selection when the user
        // clicks the popover — we need `info.text` to survive the click.
        e.preventDefault();
      }}
    >
      <button
        type="button"
        className="px-3 py-1.5 text-caption font-medium text-text-primary hover:bg-surface-warm rounded-card focus-visible:outline-none focus-visible:shadow-ring-focus"
        onClick={() => {
          const text = info.text;
          onExplain(text);
          setInfo(null);
        }}
      >
        Explain
      </button>
    </div>
  );
}
