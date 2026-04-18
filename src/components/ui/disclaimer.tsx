/**
 * Regulatory copy surfaces (U18).
 *
 * Two variants — one for persistent topic-page footers, one for the
 * onboarding consent step. Copy lives here, not inline in the pages, so
 * legal can audit and rotate it without hunting across the app and so
 * static-copy greps (see compliance.test.ts) can whitelist exactly one
 * source of truth for the "not a medical device" language.
 */

interface DisclaimerProps {
  variant?: 'topic' | 'default';
}

export function Disclaimer({ variant = 'default' }: DisclaimerProps) {
  if (variant === 'topic') {
    return (
      <p
        role="note"
        className="text-caption text-text-tertiary max-w-prose -tracking-[0.005em]"
      >
        This content is for information only. Always discuss test results and
        symptoms with a clinician.
      </p>
    );
  }
  return (
    <p
      role="note"
      className="text-caption text-text-secondary max-w-prose -tracking-[0.005em]"
    >
      Morning Form is a health information, interpretation, and decision-support
      service. It helps you understand your health data in context, identify
      low-risk lifestyle actions, and prepare for conversations with your
      clinician. It is not a medical device and does not replace clinical
      advice.
    </p>
  );
}
