'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface RevealOnScrollProps {
  children: React.ReactNode;
  /** Stagger delay in ms, applied to the reveal once the element enters view. */
  delayMs?: number;
  className?: string;
}

// Layout effect runs before the browser paints (so we can hide below-fold
// content without a visible flash); fall back to useEffect during SSR to
// silence React's server-side useLayoutEffect warning.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const TRANSITION =
  'opacity 0.75s cubic-bezier(0.22,0.61,0.36,1), transform 0.75s cubic-bezier(0.22,0.61,0.36,1)';

/**
 * Fades + rises content into view on scroll (IntersectionObserver).
 *
 * Progressive enhancement: content renders fully visible in SSR and with no
 * JavaScript, and for `prefers-reduced-motion: reduce` or already-in-view
 * elements. Only content below the fold on a motion-enabled client is hidden
 * — before first paint, via a layout effect — and then revealed as it scrolls
 * in. This avoids the flash-of-invisible-content (and permanently-blank-on-
 * no-JS) failure of a `useState(false)` default.
 */
export function RevealOnScroll({ children, delayMs = 0, className }: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Default visible so SSR / no-JS always render content. Only a motion-
  // enabled client with the element below the fold flips this to hidden.
  const [hidden, setHidden] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return; // stay visible
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return; // stay visible, no animation
    }
    const alreadyInView = el.getBoundingClientRect().top < window.innerHeight * 0.85;
    if (alreadyInView) return; // stay visible, no animation

    // Below the fold: hide before paint, then reveal when it scrolls into view.
    setHidden(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHidden(false);
          io.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -7% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? 'translateY(26px)' : 'none',
        transition: TRANSITION,
        transitionDelay: hidden ? '0ms' : `${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}
