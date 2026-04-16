'use client';

import { cn } from '@/lib/utils';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}

function Toggle({ checked, onChange, label, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center gap-3 focus-visible:outline-none',
        'focus-visible:[&>div:first-child]:shadow-ring-accent',
        className,
      )}
    >
      <div
        className={cn(
          'relative w-11 h-6 rounded-full border',
          'transition-[background-color,border-color,box-shadow] duration-300 ease-spring',
          checked ? 'bg-accent border-accent' : 'bg-surface-warm border-border-strong',
        )}
      >
        <div
          className={cn(
            'absolute top-[1px] w-[20px] h-[20px] rounded-full bg-surface',
            'shadow-[0_2px_4px_rgba(20,20,20,0.12),0_0_0_1px_rgba(20,20,20,0.04)]',
            'transition-transform duration-300 ease-spring',
            checked ? 'translate-x-[22px]' : 'translate-x-[1px]',
          )}
        />
      </div>
      {label && <span className="text-body text-text-primary">{label}</span>}
    </button>
  );
}

export { Toggle };
