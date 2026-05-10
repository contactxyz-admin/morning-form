import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MARKETS, type Market } from '@/lib/marketing/constants';
import { isMarket } from '@/lib/marketing/market';
import { MarketBanner } from '@/components/marketing/market-banner';

interface MarketLayoutProps {
  children: React.ReactNode;
  params: { market: string };
}

const MARKET_META: Record<Market, { lang: string; locale: string }> = {
  uk: { lang: 'en-GB', locale: 'en_GB' },
  us: { lang: 'en-US', locale: 'en_US' },
};

export function generateStaticParams(): Array<{ market: string }> {
  return MARKETS.map((market) => ({ market }));
}

export function generateMetadata({ params }: { params: { market: string } }): Metadata {
  if (!isMarket(params.market)) return {};
  const { locale } = MARKET_META[params.market];
  return {
    alternates: {
      canonical: `/${params.market}`,
      languages: {
        'en-GB': '/uk',
        'en-US': '/us',
        'x-default': `/${params.market}`,
      },
    },
    openGraph: {
      locale,
      type: 'website',
    },
  };
}

export default function MarketLayout({ children, params }: MarketLayoutProps) {
  if (!isMarket(params.market)) notFound();
  return (
    <>
      <MarketBanner pageMarket={params.market} />
      {children}
    </>
  );
}
