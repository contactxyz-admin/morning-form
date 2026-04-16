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
      aria-pressed={selected}
      className={cn(
        'w-full min-h-[3.5rem] px-5 py-4 rounded-card border text-left text-body',
        'transition-[transform,background-color,border-color,box-shadow] duration-450 ease-spring',
        'active:scale-[0.995] active:duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
        selected
          ? 'border-accent bg-accent-light text-text-primary shadow-ring-accent'
          : 'border-border bg-surface text-text-primary hover:-translate-y-[1px] hover:border-border-strong hover:shadow-card-hover',
        className,
      )}
    >
      {children}
    </button>
  );
}

export { SelectCard, type SelectCardProps };
