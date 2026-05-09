/**
 * MedicalWebPage JSON-LD emitter.
 *
 * Renders schema.org/MedicalWebPage from a typed payload. Path A
 * regulatory posture: `reviewedBy` is rendered as an Organization
 * (MorningForm) — not a credentialed Person — until Path B engages.
 *
 * https://schema.org/MedicalWebPage
 */
import { JsonLd } from './json-ld';
import { type Market } from '@/lib/marketing/constants';

interface MedicalWebPageProps {
  url: string;
  name: string;
  description: string;
  market: Market;
  /** ISO date string. */
  lastReviewed: string;
  /** Display name of the reviewing organisation. */
  reviewerOrgName: string;
}

export function MedicalWebPage(props: MedicalWebPageProps) {
  const { url, name, description, market, lastReviewed, reviewerOrgName } = props;
  const inLanguage = market === 'uk' ? 'en-GB' : 'en-US';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    url,
    name,
    description,
    inLanguage,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    lastReviewed,
    medicalAudience: { '@type': 'MedicalAudience', audienceType: 'Patient' },
    reviewedBy: {
      '@type': 'Organization',
      name: reviewerOrgName,
    },
  };
  return <JsonLd data={data} />;
}
