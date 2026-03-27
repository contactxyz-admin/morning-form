'use client';

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
      className={
        className ??
        'w-full h-14 px-4 rounded-input border border-border bg-surface text-heading text-text-primary text-center focus:outline-none focus:border-accent transition-colors'
      }
    />
  );
}

