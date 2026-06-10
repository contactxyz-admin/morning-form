'use client';

/**
 * `/demo/ask` — public, canned chat surface.
 *
 * No LLM call, no auth. Renders hand-scripted sequences that exercise
 * the same `MessageBubble` component as the real `/ask` page, including
 * a `ReferralChip` so visitors can see how the general scribe attributes
 * a turn to a specialist consultation.
 *
 * Picking from a suggestion chip swaps the visible sequence. Two
 * sequences go further than Q/A (plan 2026-06-10-001): the Studio
 * blood-draw booking and the Supply reorder advance through an
 * interactive card step — still fully scripted, client-side state only.
 * Content + state machine live in `src/lib/demo/ask-sequences.ts`.
 * If we ever want a "live" demo, we can wire it to a read-only LLM
 * endpoint scoped to the persona; for now, canned keeps it cheap and
 * safe to share publicly.
 */

import { useEffect, useRef, useState } from 'react';
import { MessageBubble } from '@/components/chat/message-bubble';
import { StudioBookingCard } from '@/components/demo/studio-booking-card';
import { SupplyOrderCard } from '@/components/demo/supply-order-card';
import {
  DEMO_ASK_SEQUENCES,
  INITIAL_SEQUENCE_STATE,
  advanceSequence,
  buildSequenceItems,
  upcomingSlots,
  type SequenceState,
} from '@/lib/demo/ask-sequences';

export default function DemoAskPage() {
  const [activeId, setActiveId] = useState<string>(DEMO_ASK_SEQUENCES[0].id);
  const [seqState, setSeqState] = useState<SequenceState>(INITIAL_SEQUENCE_STATE);
  const sequence =
    DEMO_ASK_SEQUENCES.find((s) => s.id === activeId) ?? DEMO_ASK_SEQUENCES[0];

  // Recomputed on every chip selection so a tab left open past midnight
  // never offers yesterday's "upcoming" slots (review finding, 2026-06-10).
  const [slots, setSlots] = useState(() => upcomingSlots(new Date()));
  const items = buildSequenceItems(sequence, seqState, slots);

  // Autoscroll parity with MessageList: follow the conversation as it
  // grows (card taps append bubbles) or switches sequence.
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items.length, activeId]);

  const selectSequence = (id: string) => {
    setActiveId(id);
    // Switching chips resets the sequence — same mental model as the
    // original turn swap — and refreshes the slot dates.
    setSeqState(INITIAL_SEQUENCE_STATE);
    setSlots(upcomingSlots(new Date()));
  };

  return (
    <div className="pt-8 pb-12 flex flex-col gap-8">
      <div className="rise">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">
          The chat — pre-recorded
        </p>
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em]">
          A team of <span className="italic">specialists</span>, one conversation.
        </h1>
        <p className="mt-6 max-w-xl text-body-lg text-text-secondary leading-relaxed">
          The general assistant answers from your record, then consults specialists when
          the question warrants it. Each consultation lands as an expandable chip above
          the answer — open one to see what the specialist actually said. And when an
          answer calls for action, it can arrange that too: try booking a blood draw at
          a Studio, or reordering your Supply stack.
        </p>
      </div>

      <div className="rounded-card border border-border bg-surface p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-4">
          Try a question
        </p>
        <div className="flex flex-wrap gap-2">
          {DEMO_ASK_SEQUENCES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSequence(s.id)}
              className={
                // globals.css suppresses the native outline globally, so
                // interactive elements must restore their own focus ring.
                s.id === activeId
                  ? 'rounded-chip border border-text-primary bg-text-primary px-4 py-2 text-caption text-surface transition-[color,border-color,background-color] duration-300 ease-spring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus'
                  : 'rounded-chip border border-border bg-surface px-4 py-2 text-caption text-text-secondary hover:border-border-strong hover:text-text-primary transition-[color,border-color] duration-300 ease-spring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus'
              }
              aria-pressed={s.id === activeId}
            >
              {s.question}
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-6">
          {items.map((item) => {
            if (item.kind === 'studio-card') {
              return (
                <StudioBookingCard
                  key={`${sequence.id}-studio-card`}
                  slots={item.slots}
                  pickedSlot={item.pickedSlot}
                  onPickSlot={(slot) =>
                    setSeqState((s) =>
                      advanceSequence(sequence, s, { type: 'pick-slot', slot }),
                    )
                  }
                />
              );
            }
            if (item.kind === 'supply-card') {
              return (
                <SupplyOrderCard
                  key={`${sequence.id}-supply-card`}
                  ordered={item.ordered}
                  onConfirm={() =>
                    setSeqState((s) =>
                      advanceSequence(sequence, s, { type: 'confirm-order' }),
                    )
                  }
                />
              );
            }
            return <MessageBubble key={item.bubble.id} message={item.bubble} />;
          })}
          <div ref={endRef} />
        </div>
      </div>

      <p className="text-caption text-text-tertiary">
        These exchanges are pre-recorded against the synthetic persona — no live LLM
        call, and the bookings and orders here are simulated. The full version, signed
        in, runs against your record and audits every turn.
      </p>
    </div>
  );
}
