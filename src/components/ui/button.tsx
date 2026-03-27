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
          'inline-flex items-center justify-center font-medium transition-all duration-250 ease-out active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
          {
            'bg-accent text-white hover:bg-accent-muted': variant === 'primary',
            'border border-border text-text-primary hover:border-border-hover bg-transparent': variant === 'secondary',
            'text-text-secondary hover:text-text-primary bg-transparent': variant === 'ghost',
            'h-12 px-6 text-body rounded-button': size === 'default',
            'h-10 px-4 text-caption rounded-button': size === 'sm',
            'h-14 px-8 text-body rounded-button': size === 'lg',
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
