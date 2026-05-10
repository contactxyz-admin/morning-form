import { notFound } from 'next/navigation';
import { isMarket } from '@/lib/marketing/market';
import { getAllSlugs, getMarketingPage } from '@/lib/marketing/slug-allowlist';
import { PageTemplate } from '@/components/marketing/page-template';

interface SlugPageProps {
  params: { market: string; slug: string };
}

/**
 * Build-time enumeration of every published page across markets.
 * Walks the slug-allowlist registry; new pages need only be added there.
 */
export function generateStaticParams(): Array<{ market: string; slug: string }> {
  return getAllSlugs().map(({ market, slug }) => ({ market, slug }));
}

export default function SlugPage({ params }: SlugPageProps) {
  if (!isMarket(params.market)) notFound();
  const page = getMarketingPage(params.market, params.slug);
  if (!page) notFound();
  return <PageTemplate page={page} />;
}
