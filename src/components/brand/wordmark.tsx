import { cn } from '@/lib/utils';

type WordmarkVariant = 'lockup' | 'inline' | 'mark';
type WordmarkSize = 'sm' | 'md' | 'lg' | 'xl';

interface WordmarkProps {
  /** lockup = mark + stacked text, inline = mark + single-line text, mark = dot cluster only */
  variant?: WordmarkVariant;
  size?: WordmarkSize;
  className?: string;
  /** Override the text colour. Mark inherits via currentColor. */
  tone?: 'primary' | 'inverse';
}

const markSizes: Record<WordmarkSize, string> = {
  sm: 'h-5 w-5',
  md: 'h-7 w-7',
  lg: 'h-10 w-10',
  xl: 'h-14 w-14',
};

const lockupTextSizes: Record<WordmarkSize, string> = {
  sm: 'text-[0.8rem] leading-[0.95]',
  md: 'text-[1.05rem] leading-[0.94]',
  lg: 'text-[1.5rem] leading-[0.92]',
  xl: 'text-[2.1rem] leading-[0.9]',
};

const inlineTextSizes: Record<WordmarkSize, string> = {
  sm: 'text-[0.95rem]',
  md: 'text-[1.15rem]',
  lg: 'text-[1.5rem]',
  xl: 'text-[2rem]',
};

function Mark({ size, className }: { size: WordmarkSize; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      className={cn(markSizes[size], className)}
    >
      <ellipse cx="27" cy="26" rx="7" ry="8" />
      <circle cx="50" cy="19" r="6" />
      <circle cx="71" cy="27" r="4.5" />
      <circle cx="83" cy="49" r="3.2" />
      <circle cx="73" cy="71" r="4.2" />
      <ellipse cx="51" cy="83" rx="7" ry="6" />
      <circle cx="28" cy="74" r="7.5" />
      <ellipse cx="14" cy="51" rx="8.5" ry="10" />
      <circle cx="42" cy="48" r="2.6" />
    </svg>
  );
}

export function Wordmark({
  variant = 'lockup',
  size = 'md',
  className,
  tone = 'primary',
}: WordmarkProps) {
  const toneClass = tone === 'inverse' ? 'text-bg' : 'text-text-primary';

  if (variant === 'mark') {
    return <Mark size={size} className={cn(toneClass, className)} />;
  }

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-2.5', toneClass, className)}>
        <Mark size={size} />
        <span
          className={cn(
            'font-sans font-extrabold tracking-[-0.04em]',
            inlineTextSizes[size],
          )}
        >
          Morning Form
        </span>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-3', toneClass, className)}>
      <Mark size={size} />
      <span
        className={cn(
          'font-sans font-extrabold tracking-[-0.045em]',
          lockupTextSizes[size],
        )}
      >
        <span className="block">Morning</span>
        <span className="block">Form</span>
      </span>
    </span>
  );
}
