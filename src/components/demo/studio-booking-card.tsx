'use client';

/**
 * Studio blood-draw booking card for `/demo/ask` (plan 2026-06-10-001 U2).
 *
 * Pure presentation over the sequence state machine: the page owns the
 * state and passes `pickedSlotId` back in. The preview tag is the
 * honesty label (R-E) — Studios have not launched; this card is the
 * deck's Layer I shown as fiction, never as live availability.
 */

import { cn } from '@/lib/utils';
import { STUDIO_VISIT_PRICE } from '@/lib/marketing/constants';
import {
  DEMO_STUDIO,
  STUDIO_BOOKING_REFERENCE,
  type DemoSlot,
} from '@/lib/demo/ask-sequences';

interface Props {
  slots: readonly DemoSlot[];
  pickedSlotId: string | null;
  onPickSlot: (slotId: string) => void;
}

export function StudioBookingCard({ slots, pickedSlotId, onPickSlot }: Props) {
  const booked = pickedSlotId !== null;

  return (
    <div className="max-w-[85%] w-full rounded-card border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
          {DEMO_STUDIO.previewTag}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
          {STUDIO_VISIT_PRICE.display} · visit
        </p>
      </div>

      <p className="mt-3 text-body font-medium text-text-primary">{DEMO_STUDIO.name}</p>
      <p className="mt-0.5 text-caption text-text-secondary">{DEMO_STUDIO.address}</p>

      {booked ? (
        <div className="mt-4 rounded-card border border-border bg-surface-warm px-3.5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
            Booked · {STUDIO_BOOKING_REFERENCE}
          </p>
          <p className="mt-1 text-body text-text-primary">
            {slots.find((s) => s.id === pickedSlotId)?.label}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
            Morning slots
          </p>
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <button
                key={slot.id}
                type="button"
                onClick={() => onPickSlot(slot.id)}
                className={cn(
                  'rounded-chip border border-border bg-surface px-4 py-2 text-caption text-text-secondary',
                  'hover:border-border-strong hover:text-text-primary',
                  'transition-[color,border-color] duration-300 ease-spring',
                )}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
