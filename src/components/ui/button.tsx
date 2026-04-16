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
          'transition-[transform,background-color,border-color,box-shadow,opacity] duration-450 ease-spring',
          'active:scale-[0.985] active:duration-150',
          'disabled:pointer-events-none',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
          {
            'bg-button text-[#FFFFFF] hover:bg-button-hover hover:shadow-[0_8px_24px_-12px_rgba(15,42,32,0.5)] active:bg-button-active disabled:bg-surface-warm disabled:text-text-tertiary disabled:border disabled:border-border-strong':
              variant === 'primary',
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
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
export { Button, type ButtonProps };
