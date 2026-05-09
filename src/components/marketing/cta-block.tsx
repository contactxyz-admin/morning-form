import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { MarketingCta } from '@/lib/marketing/page-schema';

interface CtaBlockProps {
  cta: MarketingCta;
}

export function CtaBlock({ cta }: CtaBlockProps) {
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <Link href={cta.href}>
        <Button size="lg">{cta.label}</Button>
      </Link>
      {cta.caption ? (
        <p className="text-caption text-text-tertiary">{cta.caption}</p>
      ) : null}
    </div>
  );
}
