import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoLockupProps {
  imageClassName?: string;
  textClassName?: string;
}

export function LogoLockup({ imageClassName, textClassName }: LogoLockupProps) {
  return (
    <>
      <Image
        src="/brand/morningform-horizontal-lockup-black.svg"
        alt="Morning Form"
        width={1420}
        height={219}
        className={cn('hidden h-auto w-[164px] sm:block', imageClassName)}
      />
      <span
        className={cn(
          'font-display font-light text-subheading -tracking-[0.02em] text-text-primary sm:hidden',
          textClassName,
        )}
      >
        Morning Form
      </span>
    </>
  );
}
