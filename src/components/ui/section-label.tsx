import { cn } from '@/lib/utils';

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <span className={cn('text-label uppercase text-text-tertiary font-medium', className)}>
      {children}
    </span>
  );
}

export { SectionLabel };
