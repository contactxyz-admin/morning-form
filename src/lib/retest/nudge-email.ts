/**
 * Retest nudge email copy (Plan 2026-06-17-001 U3).
 *
 * IN-LANE by construction: descriptive register only. We MEASURE how markers
 * have moved and surface what is worth DISCUSSING with a clinician — never a
 * dosing/medication directive, and never a causal-efficacy claim. (This module
 * lives under the static-copy scan root `src/lib/retest`, so its copy — comments
 * included — is held to the compliance guardrail; hence no forbidden example
 * phrases are quoted here.)
 */

import { sendEmail } from '@/lib/auth/email';
import { env } from '@/lib/env';

export interface RetestNudgeEmailInput {
  to: string;
  name: string | null;
  /** 0-based position in the nudge sequence (0 = first nudge, >0 = reminder). */
  offsetIndex: number;
}

export interface BuiltNudgeEmail {
  subject: string;
  text: string;
}

/** Build the in-lane nudge email body + subject (pure; no I/O). */
export function buildRetestNudgeEmail({ name, offsetIndex }: RetestNudgeEmailInput): BuiltNudgeEmail {
  const rebookUrl = `${env.NEXT_PUBLIC_APP_URL}/record?ref=retest-nudge`;
  const subject =
    offsetIndex === 0
      ? 'Time for your next MorningForm check'
      : 'A quick reminder: your next MorningForm check is due';
  const opener =
    offsetIndex === 0
      ? "It's time for your next check — a short blood draw so we can measure how your markers have moved since last time."
      : 'A gentle reminder that your next check is due — a short blood draw so we can measure how your markers have moved since last time.';

  const text = [
    `Hi ${name ?? 'there'},`,
    '',
    opener,
    '',
    "We've done the analysis groundwork. Once your new results are in, you'll see what has changed at a glance, with anything worth raising flagged for you to discuss with your clinician.",
    '',
    'Book your next draw here:',
    rebookUrl,
    '',
    'A few minutes, once a quarter — we handle the rest.',
    '',
    '— MorningForm',
  ].join('\n');

  return { subject, text };
}

/** Render + send the retest nudge email. Throws on send failure (the caller's
 * per-draw try/catch decides what to do — bookkeeping is not advanced on throw). */
export async function sendRetestNudgeEmail(input: RetestNudgeEmailInput): Promise<void> {
  const { subject, text } = buildRetestNudgeEmail(input);
  await sendEmail({ to: input.to, subject, text });
}
