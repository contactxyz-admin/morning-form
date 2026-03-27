'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', fullWidth, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-semibold transition-all duration-250 ease-out active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
          {
            'bg-button text-white hover:bg-button-hover active:bg-button-active': variant === 'primary',
            'border border-border text-text-primary hover:border-border-hover bg-transparent active:bg-surface': variant === 'secondary',
            'text-text-secondary hover:text-text-primary bg-transparent': variant === 'ghost',
            'min-h-[44px] px-4 py-3 text-body rounded-button': size === 'default',
            'min-h-[44px] px-4 py-3 text-caption rounded-button': size === 'sm',
            'min-h-[52px] px-5 py-3 text-body rounded-button': size === 'lg',
            'w-full': fullWidth,
          },
          loading && 'animate-pulse-subtle',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button, type ButtonProps };
