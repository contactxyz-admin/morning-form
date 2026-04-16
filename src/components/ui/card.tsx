'use client';

import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'action' | 'contextual' | 'paper';
  accentColor?: 'teal' | 'amber' | 'sage' | 'alert';
  clickable?: boolean;
}

const accentColorMap = {
  teal: 'before:bg-accent',
  amber: 'before:bg-caution',
  sage: 'before:bg-positive',
  alert: 'before:bg-alert',
};

function Card({
  className,
  variant = 'default',
  accentColor,
  clickable,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'relative rounded-card transition-all duration-450 ease-spring',
        // Base padding scales with viewport for proper breathing room.
        'p-5 sm:p-6',
        {
          'bg-surface border border-border': variant === 'default',
          'bg-surface border border-border overflow-hidden': variant === 'action',
          'bg-accent-light border border-accent/10': variant === 'contextual',
          'bg-surface-warm border border-border': variant === 'paper',
        },
        // Action variant gets a thin accent ribbon along the leading edge.
        variant === 'action' && accentColor && [
          'before:absolute before:left-0 before:top-5 before:bottom-5 before:w-[3px] before:rounded-full',
          accentColorMap[accentColor],
        ],
        clickable && [
          'cursor-pointer',
          'hover:border-border-strong hover:shadow-card-hover',
          'active:shadow-none active:duration-150',
        ],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Card, type CardProps };
