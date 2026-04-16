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
  const isAction = variant === 'action';
  return (
    <div
      className={cn(
        'relative rounded-card transition-[border-color,box-shadow,transform] duration-450 ease-spring',
        // Base padding scales with viewport for proper breathing room.
        'p-5 sm:p-6',
        {
          'bg-surface border border-border': variant === 'default',
          'bg-surface border border-border overflow-hidden': isAction,
          'bg-accent-light border border-accent/10': variant === 'contextual',
          'bg-surface-warm border border-border': variant === 'paper',
        },
        // Action variant accent ribbon: grows from the top on hover/active so
        // the resting state is quiet and the ribbon rewards intent.
        isAction && accentColor && [
          "before:content-[''] before:absolute before:left-0 before:top-5 before:bottom-5 before:w-[3px] before:rounded-full before:origin-top",
          'before:scale-y-[0.35] before:opacity-50 before:transition-[transform,opacity] before:duration-450 before:ease-spring',
          'group-hover:before:scale-y-100 group-hover:before:opacity-100',
          'hover:before:scale-y-100 hover:before:opacity-100',
          accentColorMap[accentColor],
        ],
        // Hover state stays dead-flat on the paper — just a border shift and
        // a nearly-imperceptible soft halo. No translate lift (that move belongs
        // to cards-on-cards UIs; this one wants to feel printed).
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
