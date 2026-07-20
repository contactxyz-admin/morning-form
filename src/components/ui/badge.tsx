import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

/** Soft pill chip — mono-uppercase label with an optional live-state dot. */
export function Badge({ children, dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-chip bg-brand-blue-50 px-3.5 py-1.5',
        'font-mono text-[11px] uppercase tracking-[0.14em] text-brand-blue-900',
        className,
      )}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-button animate-pulse-subtle"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
