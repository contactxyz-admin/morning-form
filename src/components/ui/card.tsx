'use client';

import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'action' | 'contextual' | 'paper' | 'sunken';
  accentColor?: 'teal' | 'amber' | 'sage' | 'alert';
  clickable?: boolean;
  inset?: boolean;
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
  inset,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'relative rounded-card transition-[box-shadow,border-color,background-color,transform] duration-450 ease-spring',
        // Base padding — slightly tighter to feel architectural; paper variant opts into more breathing room.
        inset ? 'p-0' : 'p-5 sm:p-6',
        {
          'bg-surface border border-border': variant === 'default',
          'bg-surface border border-border overflow-hidden': variant === 'action',
          'bg-accent-light border border-accent/10': variant === 'contextual',
          'bg-surface-warm border border-border': variant === 'paper',
          'bg-surface-sunken border border-border/60': variant === 'sunken',
        },
        // Action variant: tapered accent ribbon, slightly inset so it feels etched rather than applied.
        variant === 'action' && accentColor && [
          'before:absolute before:left-0 before:top-6 before:bottom-6 before:w-[2px] before:rounded-full',
          'before:transition-all before:duration-450 before:ease-spring',
          accentColorMap[accentColor],
        ],
        clickable && [
          'cursor-pointer',
          'hover:border-border-strong hover:shadow-card-hover hover:bg-surface',
          'active:shadow-card-press active:duration-150',
          variant === 'action' && 'hover:before:top-5 hover:before:bottom-5',
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
