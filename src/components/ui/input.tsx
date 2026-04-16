'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-label uppercase text-text-tertiary mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-12 px-4 rounded-input border bg-surface text-body text-text-primary',
            'placeholder:text-text-tertiary',
            'transition-[border-color,box-shadow] duration-300 ease-spring',
            'focus:outline-none focus:border-text-primary focus:shadow-ring-accent',
            error ? 'border-alert focus:border-alert' : 'border-border',
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-caption text-alert">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
export { Input, type InputProps };
