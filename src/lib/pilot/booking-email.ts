/**
 * Slot-booking confirmation email — builder+sender split per
 * src/lib/retest/nudge-email.ts. Venue, London-rendered time, and prep
 * notes; descriptive register (compliance-scanned via the src/lib/pilot
 * scan root).
 */
import { sendEmail } from '@/lib/auth/email';
import { PILOT_TIMEZONE } from './config';

export interface SlotBookingEmailInput {
  name: string | null;
  venueName: string;
  venueAddress: string;
  startsAt: Date;
  notes: string | null;
}

export function formatSlotTime(startsAt: Date): string {
  return startsAt.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PILOT_TIMEZONE,
  });
}

export function buildSlotBookingConfirmationEmail(input: SlotBookingEmailInput): {
  subject: string;
  text: string;
} {
  const greeting = input.name ? `Hi ${input.name},` : 'Hi,';
  const when = formatSlotTime(input.startsAt);
  const subject = `Your blood draw is booked — ${when}`;
  const text = [
    greeting,
    '',
    'Your in-gym blood draw is booked:',
    '',
    `When: ${when} (UK time)`,
    `Where: ${input.venueName}, ${input.venueAddress}`,
    ...(input.notes ? ['', `Preparation: ${input.notes}`] : []),
    '',
    'You can change your mind and cancel any time before the draw from the booking page — cancelling withdraws your consent to the procedure.',
    '',
    'Morning Form',
  ].join('\n');
  return { subject, text };
}

export async function sendSlotBookingConfirmationEmail(
  input: SlotBookingEmailInput & { to: string },
): Promise<void> {
  const { subject, text } = buildSlotBookingConfirmationEmail(input);
  await sendEmail({ to: input.to, subject, text });
}
