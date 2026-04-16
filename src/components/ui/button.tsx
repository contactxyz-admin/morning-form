'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  iconLeading?: ReactNode;
  iconTrailing?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'default',
      fullWidth,
      loading,
      iconLeading,
      iconTrailing,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const isPrimary = variant === 'primary';
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'group relative appearance-none inline-flex items-center justify-center gap-2 font-medium tracking-[-0.01em]',
          'transition-[transform,background-color,border-color,box-shadow,opacity] duration-450 ease-spring',
          'active:scale-[0.985] active:duration-150',
          'disabled:pointer-events-none',
          // Custom moss focus ring, offset from button edge; keeps the paper
          // vibe (no electric-blue browser default).
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          {
            // Primary: deep moss with an inner top highlight, warm hover halo.
            'bg-button text-[#FFFFFF] shadow-button-inner hover:bg-button-hover hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_28px_-12px_rgba(15,42,32,0.55)] active:bg-button-active disabled:bg-surface-warm disabled:text-text-tertiary disabled:border disabled:border-border-strong disabled:shadow-none':
              isPrimary,
            'border border-border-strong text-text-primary bg-surface hover:border-text-primary hover:shadow-card-hover active:bg-surface-warm disabled:opacity-50':
              variant === 'secondary',
            'text-text-secondary hover:text-text-primary bg-transparent disabled:text-text-secondary disabled:opacity-50':
              variant === 'ghost',
            'min-h-[44px] px-5 py-3 text-body rounded-button': size === 'default',
            'min-h-[40px] px-4 py-2.5 text-caption rounded-button': size === 'sm',
            'min-h-[56px] px-7 py-4 text-body-lg rounded-button': size === 'lg',
            'w-full': fullWidth,
          },
          loading && 'animate-pulse-subtle',
          className,
        )}
        {...props}
      >
        {iconLeading && (
          <span
            aria-hidden
            className="inline-flex shrink-0 -ml-0.5 transition-transform duration-450 ease-spring group-hover:-translate-x-0.5"
          >
            {iconLeading}
          </span>
        )}
        <span className="inline-block">{children}</span>
        {iconTrailing && (
          <span
            aria-hidden
            className="inline-flex shrink-0 -mr-0.5 transition-transform duration-450 ease-spring group-hover:translate-x-0.5"
          >
            {iconTrailing}
          </span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
export { Button, type ButtonProps };
