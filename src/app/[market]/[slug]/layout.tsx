import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isMarket } from '@/lib/marketing/market';
import { getMarketingPage, hasCounterpart } from '@/lib/marketing/slug-allowlist';
import { MedicalWebPage } from '@/components/structured-data/medical-webpage';
import { FaqPage } from '@/components/structured-data/faq-page';
import { VisitBeacon } from '@/components/marketing/visit-beacon';

interface SlugLayoutProps {
  children: React.ReactNode;
  params: { market: string; slug: string };
}

export function generateMetadata({ params }: { params: { market: string; slug: string } }): Metadata {
  if (!isMarket(params.market)) return {};
  const page = getMarketingPage(params.market, params.slug);
  if (!page) return {};

  const ukUs = hasCounterpart(page.market, page.slug);
  const languages: Record<string, string> = {
    [page.market === 'uk' ? 'en-GB' : 'en-US']: `/${page.market}/${page.slug}`,
  };
  if (ukUs) {
    const other = page.market === 'uk' ? 'us' : 'uk';
    languages[other === 'uk' ? 'en-GB' : 'en-US'] = `/${other}/${page.slug}`;
  }
  languages['x-default'] = `/${page.market}/${page.slug}`;

  return {
    title: page.seoTitle,
    description: page.metaDescription,
    alternates: {
      canonical: `/${page.market}/${page.slug}`,
      languages,
    },
    openGraph: {
      title: page.seoTitle,
      description: page.metaDescription,
      locale: page.market === 'uk' ? 'en_GB' : 'en_US',
      type: 'article',
    },
  };
}

export default function SlugLayout({ children, params }: SlugLayoutProps) {
  if (!isMarket(params.market)) notFound();
  const page = getMarketingPage(params.market, params.slug);
  if (!page) notFound();

  const url = `/${page.market}/${page.slug}`;
  return (
    <>
      <MedicalWebPage
        url={url}
        name={page.h1}
        description={page.metaDescription}
        market={page.market}
        lastReviewed={page.lastReviewedAt}
        reviewerOrgName="Morning Form"
      />
      {page.faq && page.faq.length > 0 ? <FaqPage entries={page.faq} /> : null}
      <VisitBeacon slug={page.slug} cohort={page.cohortKey} market={page.market} />
      {children}
    </>
  );
}
