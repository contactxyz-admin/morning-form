'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tonal' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'default',
      fullWidth,
      loading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'group relative appearance-none inline-flex items-center justify-center font-medium tracking-[-0.01em]',
          'transition-[transform,background-color,border-color,box-shadow,opacity,color] duration-450 ease-spring',
          'active:scale-[0.985] active:duration-150',
          'disabled:pointer-events-none',
          'focus-visible:outline-none focus-visible:shadow-ring-focus',
          {
            // Primary — ink button with paired shadows (inset highlight + soft drop) for depth.
            'bg-button text-[#FDFBF6] shadow-button-primary hover:bg-button-hover hover:shadow-button-primary-hover active:bg-button-active disabled:bg-surface-warm disabled:text-text-secondary disabled:shadow-none disabled:border disabled:border-border-strong':
              variant === 'primary',
            // Secondary — flat paper, hairline border, pulls toward ink on hover.
            'border border-border-strong text-text-primary bg-surface hover:border-text-primary hover:shadow-card-hover active:bg-surface-warm disabled:opacity-50':
              variant === 'secondary',
            // Tonal — quiet accent-light chip, used for in-context affirmatives.
            'bg-accent-light text-accent-deep border border-accent/10 hover:bg-accent-light hover:border-accent/30 hover:shadow-card-hover active:bg-accent-light/80 disabled:opacity-50':
              variant === 'tonal',
            // Ghost — text-only; the underline animates in on hover rather than boxing up.
            'text-text-secondary hover:text-text-primary bg-transparent disabled:text-text-secondary disabled:opacity-50':
              variant === 'ghost',
            'min-h-[44px] px-5 py-3 text-body rounded-button': size === 'default',
            'min-h-[36px] px-3.5 py-2 text-caption rounded-button': size === 'sm',
            'min-h-[56px] px-7 py-4 text-body-lg rounded-button': size === 'lg',
            'w-full': fullWidth,
          },
          loading && 'animate-pulse-subtle',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
export { Button, type ButtonProps };
