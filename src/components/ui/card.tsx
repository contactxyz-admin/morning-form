'use client';

import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'action' | 'contextual';
  accentColor?: 'teal' | 'amber' | 'sage' | 'alert';
  clickable?: boolean;
}

const accentColorMap = {
  teal: 'border-l-accent',
  amber: 'border-l-caution',
  sage: 'border-l-positive',
  alert: 'border-l-alert',
};

function Card({ className, variant = 'default', accentColor, clickable, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card p-6 transition-all duration-250',
        {
          'bg-surface border border-border shadow-card': variant === 'default',
          'bg-surface border border-border shadow-card border-l-2': variant === 'action',
          'bg-accent-light border border-accent/10': variant === 'contextual',
        },
        variant === 'action' && accentColor && accentColorMap[accentColor],
        clickable && 'cursor-pointer hover:shadow-card-hover',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Card, type CardProps };
