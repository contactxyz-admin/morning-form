import type { CohortKey } from '@/lib/marketing/cohorts';
import type { Market } from '@/lib/marketing/constants';
import type { MarketingCta } from '@/lib/marketing/page-schema';
import { EmailCaptureForm } from './email-capture-form';

interface CtaBlockProps {
  cta: MarketingCta;
  /** Page-level attribution context — passed through to the email form. */
  market: Market;
  cohort: CohortKey;
  slug: string;
}

/**
 * Phase 0 CTA: render an inline email-capture form that posts to
 * /api/auth/request-link with signup-context attribution. The page-
 * data `cta.href` is preserved on the schema for Phase 1, when the
 * upload route replaces the email-first flow with a public no-auth
 * upload (the href becomes the post-upload destination).
 */
export function CtaBlock({ cta, market, cohort, slug }: CtaBlockProps) {
  return (
    <EmailCaptureForm
      market={market}
      cohort={cohort}
      slug={slug}
      buttonLabel={cta.label}
      caption={cta.caption}
    />
  );
}
