'use client';

import { useEffect, useRef, useState } from 'react';

interface RevealOnScrollProps {
  children: React.ReactNode;
  /** Stagger delay in ms, applied once the element enters view. */
  delayMs?: number;
  className?: string;
}

/**
 * Fades + rises content into view on scroll (IntersectionObserver), matching
 * the redesign's `data-reveal` treatment. Content already in the initial
 * viewport, or `prefers-reduced-motion: reduce`, renders visible immediately.
 */
export function RevealOnScroll({ children, delayMs = 0, className }: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const alreadyInView = el.getBoundingClientRect().top < window.innerHeight * 0.85;
    if (reduced || alreadyInView) {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
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
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(26px)',
        transition: 'opacity 0.75s cubic-bezier(0.22,0.61,0.36,1), transform 0.75s cubic-bezier(0.22,0.61,0.36,1)',
        transitionDelay: visible ? `${delayMs}ms` : '0ms',
      }}
    >
      {children}
    </div>
  );
}
