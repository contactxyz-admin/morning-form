'use client';

import { cn } from '@/lib/utils';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function TimePicker({ value, onChange, className }: TimePickerProps) {
  return (
    <input
      type="time"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'w-full h-14 px-4 rounded-input border border-border bg-surface',
        'font-display text-heading text-text-primary text-center tracking-[-0.02em]',
        'transition-[border-color,box-shadow] duration-300 ease-spring',
        'focus:outline-none focus:border-text-primary focus:shadow-ring-accent',
        className,
      )}
    />
  );
}
