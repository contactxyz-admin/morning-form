import { describe, expect, it } from 'vitest';
import { buildSlotBookingConfirmationEmail, formatSlotTime } from './booking-email';

// 12:00 UTC on a July date — London is on BST (+1), so the rendered wall
// clock must read 13:00, proving the Europe/London pin actually applies.
const BST_NOON_UTC = new Date('2026-07-20T12:00:00Z');

const INPUT = {
  name: 'Jane',
  venueName: 'Third Space Soho',
  venueAddress: '67 Brewer St, London',
  startsAt: BST_NOON_UTC,
  notes: 'Fast from 10pm the night before; drink water as normal.',
};

describe('formatSlotTime', () => {
  it('renders Europe/London wall-clock time (BST offset applied)', () => {
    const rendered = formatSlotTime(BST_NOON_UTC);
    expect(rendered).toContain('13:00');
    expect(rendered).toContain('Monday');
    expect(rendered).toContain('20 July');
  });
});

describe('buildSlotBookingConfirmationEmail', () => {
  it('includes venue, address, London time, and prep notes', () => {
    const { subject, text } = buildSlotBookingConfirmationEmail(INPUT);
    expect(subject).toContain('13:00');
    expect(text).toContain('Hi Jane,');
    expect(text).toContain('Third Space Soho');
    expect(text).toContain('67 Brewer St, London');
    expect(text).toContain('(UK time)');
    expect(text).toContain('Preparation: Fast from 10pm');
  });

  it('omits the preparation line when the slot has no notes', () => {
    const { text } = buildSlotBookingConfirmationEmail({ ...INPUT, notes: null });
    expect(text).not.toContain('Preparation:');
  });

  it('greets neutrally when no display name exists', () => {
    const { text } = buildSlotBookingConfirmationEmail({ ...INPUT, name: null });
    expect(text.startsWith('Hi,')).toBe(true);
  });

  it('states the right to withdraw and carries no clinical or alarm language', () => {
    const { subject, text } = buildSlotBookingConfirmationEmail(INPUT);
    expect(text).toContain('cancelling withdraws your consent');
    const everything = `${subject}\n${text}`.toLowerCase();
    for (const banned of ['diagnos', 'urgent', 'immediately', 'emergency', 'abnormal', 'disease']) {
      expect(everything).not.toContain(banned);
    }
  });
});
