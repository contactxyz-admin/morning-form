'use client';

/**
 * Chat composer. Auto-grows the textarea, submits on Enter,
 * adds a newline on Shift+Enter. Disabled while a turn is in
 * flight so we can't double-fire — the parent drives the
 * `disabled` state off the hook's status.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  disabled?: boolean;
  onSubmit: (text: string) => void;
  /** Placeholder text for the empty state. */
  placeholder?: string;
  /** Optional initial value — used by `/ask?seed=...` deep-link (U6). */
  initialValue?: string;
  /** Fire once the initial value has been submitted so the seed doesn't re-fire. */
  onInitialSubmitted?: () => void;
}

const MAX_CHARS = 2000;

export function Composer({
  disabled,
  onSubmit,
  placeholder = 'Ask about your health…',
  initialValue,
  onInitialSubmitted,
}: Props) {
  const [value, setValue] = useState(initialValue ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoFiredRef = useRef(false);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [value]);

  // Auto-fire once when an initialValue is provided and we haven't
  // submitted yet. Guards against re-fire on rerender.
  useEffect(() => {
    if (autoFiredRef.current) return;
    if (!initialValue || initialValue.trim().length === 0) return;
    autoFiredRef.current = true;
    onSubmit(initialValue.trim());
    setValue('');
    onInitialSubmitted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSubmit(trimmed);
    setValue('');
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div
        className={cn(
          'flex items-end gap-2',
          'rounded-card border border-border bg-surface px-3 py-2',
          'focus-within:border-border-strong focus-within:shadow-card-hover',
          'transition-[border-color,box-shadow] duration-300 ease-spring',
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={handleKey}
          placeholder={placeholder}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent text-body text-text-primary placeholder:text-text-tertiary',
            'focus:outline-none',
            'py-2',
          )}
          disabled={disabled}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={disabled || value.trim().length === 0}
        >
          Ask
        </Button>
      </div>
      {value.length > MAX_CHARS * 0.9 && (
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary self-end">
          {value.length} / {MAX_CHARS}
        </p>
      )}
    </form>
  );
}
