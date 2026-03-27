'use client';

import { cn } from '@/lib/utils';

interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

function Chip({ selected, onClick, children, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-chip px-4 py-2 text-caption font-medium transition-all duration-150 border',
        selected
          ? 'bg-accent text-white border-accent'
          : 'bg-surface text-text-primary border-border hover:border-border-hover',
        className
      )}
    >
      {children}
    </button>
  );
}

export { Chip, type ChipProps };
