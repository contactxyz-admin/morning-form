'use client';

/**
 * Soft fallback for /reveal/* pages when the current user hasn't completed
 * the assessment yet.
 *
 * Pre-2026-05-15: the reveal pages auto-redirected un-assessed users to
 * /assessment, treating the assessment as a forced onboarding gate.
 *
 * Post-2026-05-15: the assessment is optional personalisation, so the
 * reveal pages stay rendered and surface this card with a "Take the
 * assessment" CTA. Users who navigate here directly (e.g. from a
 * bookmark or `?entity=` deep link) see what the page WOULD show after
 * personalisation, framed as an invitation.
 *
 * Used by: /reveal/profile, /reveal/priorities, /reveal/rationale,
 * /reveal/begin, /reveal/expectations.
 */
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/section-label';

interface Props {
  /** Page-specific label so each surface tells a coherent story */
  surface: 'profile' | 'priorities' | 'rationale' | 'begin' | 'expectations';
}

const COPY: Record<
  Props['surface'],
  { sectionLabel: string; headline: string; body: string }
> = {
  profile: {
    sectionLabel: 'Your state profile',
    headline: 'Personalise your record to see your profile.',
    body: 'The 8-minute assessment shapes your state profile — the underlying pattern your data reflects. Take it whenever you’re ready; it’s optional.',
  },
  priorities: {
    sectionLabel: 'Your priorities',
    headline: 'Personalise your record to see your priorities.',
    body: 'Once you take the assessment we surface the biomarkers that matter most for your pattern, ranked. It’s optional and takes about 8 minutes.',
  },
  rationale: {
    sectionLabel: 'How we got here',
    headline: 'Personalise your record to see the rationale.',
    body: 'After the assessment we can explain why each priority was ranked where it was. Take it whenever — it’s optional.',
  },
  begin: {
    sectionLabel: 'Begin',
    headline: 'Your record is ready when you are.',
    body: 'You can take the assessment now to personalise everything, or explore your record first and personalise later.',
  },
  expectations: {
    sectionLabel: 'What to expect',
    headline: 'Personalise your record to see what to expect.',
    body: 'The assessment shapes the expectations page. It’s optional — take it whenever it makes sense for you.',
  },
};

export function RevealNotOnboardedCard({ surface }: Props) {
  const copy = COPY[surface];
  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32">
      <div className="max-w-xl mx-auto">
        <SectionLabel>{copy.sectionLabel}</SectionLabel>
        <Card variant="paper" className="mt-8">
          <h2 className="font-display font-light text-display-sm text-text-primary -tracking-[0.03em] leading-[1.15]">
            {copy.headline}
          </h2>
          <p className="mt-5 text-body text-text-secondary leading-relaxed">
            {copy.body}
          </p>
          <div className="mt-8 flex gap-3 flex-wrap">
            <Link href="/assessment">
              <Button size="lg">Take the assessment</Button>
            </Link>
            <Link href="/record">
              <Button variant="secondary" size="lg">
                Back to my record
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
