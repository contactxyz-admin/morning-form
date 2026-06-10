import { describe, expect, it } from 'vitest';
import {
  DEMO_ASK_SEQUENCES,
  DEMO_STUDIO,
  INITIAL_SEQUENCE_STATE,
  STUDIO_BOOKING_REFERENCE,
  SUPPLY_ORDER_REFERENCE,
  advanceSequence,
  buildSequenceItems,
  upcomingSlots,
  type DemoSequence,
} from './ask-sequences';

function sequenceById(id: string): DemoSequence {
  const seq = DEMO_ASK_SEQUENCES.find((s) => s.id === id);
  if (!seq) throw new Error(`missing sequence ${id}`);
  return seq;
}

const booking = () => sequenceById('studio-booking');
const supply = () => sequenceById('supply-reorder');
const legacyTurn = () => sequenceById('fatigue');

describe('upcomingSlots', () => {
  // Local-time Date constructors throughout — the helper works in the
  // visitor's timezone, so tests must too.
  it('returns the next weekday mornings from a midweek now', () => {
    // Wed 10 Jun 2026 → Thu 11, Fri 12, Mon 15 (weekend skipped).
    const slots = upcomingSlots(new Date(2026, 5, 10, 9, 30));
    expect(slots.map((s) => s.id)).toEqual([
      'slot-2026-6-11',
      'slot-2026-6-12',
      'slot-2026-6-15',
    ]);
  });

  it('rolls a Friday-evening now to Monday-first slots', () => {
    const slots = upcomingSlots(new Date(2026, 5, 12, 20, 0));
    expect(slots.map((s) => s.id)).toEqual([
      'slot-2026-6-15',
      'slot-2026-6-16',
      'slot-2026-6-17',
    ]);
  });

  it('rolls a Sunday now to Monday-first slots', () => {
    const slots = upcomingSlots(new Date(2026, 5, 14, 11, 0));
    expect(slots[0]?.id).toBe('slot-2026-6-15');
  });

  it('labels every slot with a weekday and a morning time', () => {
    for (const slot of upcomingSlots(new Date(2026, 5, 10))) {
      expect(slot.label).toMatch(/(Mon|Tue|Wed|Thu|Fri)/);
      expect(slot.label).toMatch(/· (8:40|9:10|8:20)$/);
    }
  });
});

describe('advanceSequence', () => {
  const slots = upcomingSlots(new Date(2026, 5, 10));

  it('books the studio sequence on pick-slot, exactly once', () => {
    const after = advanceSequence(booking(), INITIAL_SEQUENCE_STATE, {
      type: 'pick-slot',
      slot: slots[0],
    });
    expect(after).toEqual({ stage: 'completed', pickedSlot: slots[0] });

    // Completed is terminal — a second pick does not re-book.
    const repeat = advanceSequence(booking(), after, {
      type: 'pick-slot',
      slot: slots[1],
    });
    expect(repeat).toBe(after);
  });

  it('completes the supply sequence on confirm-order, idempotently', () => {
    const after = advanceSequence(supply(), INITIAL_SEQUENCE_STATE, {
      type: 'confirm-order',
    });
    expect(after).toEqual({ stage: 'completed', pickedSlot: null });
    expect(advanceSequence(supply(), after, { type: 'confirm-order' })).toBe(after);
  });

  it('ignores events that do not match the interaction kind', () => {
    expect(
      advanceSequence(booking(), INITIAL_SEQUENCE_STATE, { type: 'confirm-order' }),
    ).toBe(INITIAL_SEQUENCE_STATE);
    expect(
      advanceSequence(supply(), INITIAL_SEQUENCE_STATE, {
        type: 'pick-slot',
        slot: slots[0],
      }),
    ).toBe(INITIAL_SEQUENCE_STATE);
    expect(
      advanceSequence(legacyTurn(), INITIAL_SEQUENCE_STATE, { type: 'confirm-order' }),
    ).toBe(INITIAL_SEQUENCE_STATE);
  });
});

describe('buildSequenceItems', () => {
  const slots = upcomingSlots(new Date(2026, 5, 10));

  it('renders a legacy turn as two bubbles and nothing else', () => {
    const items = buildSequenceItems(legacyTurn(), INITIAL_SEQUENCE_STATE, slots);
    expect(items.map((i) => i.kind)).toEqual(['bubble', 'bubble']);
    const [q, a] = items;
    if (q.kind !== 'bubble' || a.kind !== 'bubble') throw new Error('expected bubbles');
    expect(q.bubble.id).toBe('fatigue-q');
    expect(a.bubble.id).toBe('fatigue-a');
    if (a.bubble.role !== 'assistant') throw new Error('expected assistant bubble');
    expect(a.bubble.citations).toEqual([]);
    expect(a.bubble.referrals).toHaveLength(2);
  });

  it('renders the booking sequence answered: bubbles then an unpicked card', () => {
    const items = buildSequenceItems(booking(), INITIAL_SEQUENCE_STATE, slots);
    expect(items.map((i) => i.kind)).toEqual(['bubble', 'bubble', 'studio-card']);
    const card = items[2];
    if (card.kind !== 'studio-card') throw new Error('expected studio card');
    expect(card.pickedSlot).toBeNull();
    expect(card.slots).toHaveLength(3);
  });

  it('appends the booked confirmation with the picked slot and reference', () => {
    const picked = slots[1];
    const state = advanceSequence(booking(), INITIAL_SEQUENCE_STATE, {
      type: 'pick-slot',
      slot: picked,
    });
    const items = buildSequenceItems(booking(), state, slots);
    expect(items.map((i) => i.kind)).toEqual([
      'bubble',
      'bubble',
      'studio-card',
      'bubble',
    ]);
    const card = items[2];
    if (card.kind !== 'studio-card') throw new Error('expected studio card');
    // The card and the confirmation read the SAME object — divergence between
    // the two render paths is structurally impossible (review finding).
    expect(card.pickedSlot).toBe(picked);
    const confirmation = items[3];
    if (confirmation.kind !== 'bubble') throw new Error('expected confirmation bubble');
    expect(confirmation.bubble.content).toContain(picked.label);
    expect(confirmation.bubble.content).toContain(STUDIO_BOOKING_REFERENCE);
    expect(confirmation.bubble.content).toContain(DEMO_STUDIO.name);
    expect(confirmation.bubble.content).toContain('Decisions timeline');
  });

  it('appends the order confirmation with the order reference', () => {
    const state = advanceSequence(supply(), INITIAL_SEQUENCE_STATE, {
      type: 'confirm-order',
    });
    const items = buildSequenceItems(supply(), state, slots);
    expect(items.map((i) => i.kind)).toEqual([
      'bubble',
      'bubble',
      'supply-card',
      'bubble',
    ]);
    const card = items[2];
    if (card.kind !== 'supply-card') throw new Error('expected supply card');
    expect(card.ordered).toBe(true);
    const confirmation = items[3];
    if (confirmation.kind !== 'bubble') throw new Error('expected confirmation bubble');
    expect(confirmation.bubble.content).toContain(SUPPLY_ORDER_REFERENCE);
  });

  it('keeps sequence ids unique (stable bubble keys depend on it)', () => {
    const ids = DEMO_ASK_SEQUENCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
