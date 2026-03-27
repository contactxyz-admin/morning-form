'use client';

import { cn } from '@/lib/utils';

interface SelectCardProps {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

function SelectCard({ selected, onClick, children, className }: SelectCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full min-h-[3.5rem] px-5 py-4 rounded-card border text-left transition-all duration-150 text-body',
        selected
          ? 'border-accent bg-accent-light text-text-primary'
          : 'border-border bg-surface text-text-primary hover:border-border-hover',
        className
      )}
    >
      {children}
    </button>
  );
}

export { SelectCard, type SelectCardProps };
