/**
 * FAQPage JSON-LD emitter.
 *
 * https://schema.org/FAQPage
 */
import { JsonLd } from './json-ld';
import type { MarketingFaqEntry } from '@/lib/marketing/page-schema';

interface FaqPageProps {
  entries: ReadonlyArray<MarketingFaqEntry>;
}

export function FaqPage({ entries }: FaqPageProps) {
  if (entries.length === 0) return null;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((e) => ({
      '@type': 'Question',
      name: e.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: e.answer,
      },
    })),
  };
  return <JsonLd data={data} />;
}
