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
      aria-pressed={selected}
      className={cn(
        'rounded-chip px-4 py-2 text-caption font-medium border',
        'transition-[transform,background-color,border-color,color] duration-450 ease-spring',
        'active:scale-[0.97] active:duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
        selected
          ? 'bg-accent text-[#FFFFFF] border-accent'
          : 'bg-surface text-text-secondary border-border hover:text-text-primary hover:border-border-strong',
        className,
      )}
    >
      {children}
    </button>
  );
}

export { Chip, type ChipProps };
