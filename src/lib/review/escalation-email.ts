/**
 * Escalation notifications — builder+sender split per the retest nudge-email
 * pattern (src/lib/retest/nudge-email.ts).
 *
 * The member email deliberately contains NO marker names, values, or any
 * clinical specifics: email is an unencrypted channel (same posture as the
 * reference-only booking ops email). The member signs in to see which
 * results carry the flag. Register: descriptive, calm, GP-directed — never
 * diagnostic, never alarm language.
 *
 * PENDING CLINICAL REVIEW: the member-facing copy below must be signed off
 * by the named clinician before CLINICIAN_REVIEW_ENABLED flips in prod
 * (program handoff item).
 */
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/auth/email';

export interface MemberEscalationEmailInput {
  name: string | null;
}

export function buildMemberEscalationEmail(input: MemberEscalationEmailInput): {
  subject: string;
  text: string;
} {
  const greeting = input.name ? `Hi ${input.name},` : 'Hi,';
  const recordUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/record?ref=clinician-escalation`;
  const subject = 'Your recent results — a clinician recommends a GP conversation';
  const text = [
    greeting,
    '',
    'A clinician has reviewed your recent test results and recommends discussing one or more of them with your GP soon.',
    '',
    'Sign in to see which results are flagged and the questions worth asking:',
    recordUrl,
    '',
    'This is information to help you prepare for a conversation with your GP — it is not a diagnosis.',
    '',
    'Morning Form',
  ].join('\n');
  return { subject, text };
}

export async function sendMemberEscalationEmail(
  input: MemberEscalationEmailInput & { to: string },
): Promise<void> {
  const { subject, text } = buildMemberEscalationEmail(input);
  await sendEmail({ to: input.to, subject, text });
}

/** Ops notice — reference-only (review id prefix), no member identity, no clinical content. */
export function buildOpsEscalationNotice(input: { reviewId: string }): {
  subject: string;
  text: string;
} {
  const ref = input.reviewId.slice(0, 8);
  return {
    subject: `[morning-form] Clinical escalation ${ref}`,
    text: [
      `A clinician escalated a result review (ref ${ref}).`,
      'Details are in the clinic queue — this notice is reference-only.',
    ].join('\n'),
  };
}

export async function sendOpsEscalationNotice(input: { reviewId: string }): Promise<void> {
  if (!env.OPS_EMAIL) {
    // assertAuthEnv fails closed in prod when the flag is on; in dev an
    // unset OPS_EMAIL just skips the notice rather than throwing.
    console.warn('[review] OPS_EMAIL unset — ops escalation notice skipped');
    return;
  }
  const { subject, text } = buildOpsEscalationNotice(input);
  await sendEmail({ to: env.OPS_EMAIL, subject, text });
}
