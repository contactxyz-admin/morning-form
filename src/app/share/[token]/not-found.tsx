import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';

export default function ShareNotFound() {
  return (
    <div className="px-5 pt-6 grain-page pb-24">
      <Card variant="paper" className="py-12 text-center" accentColor="alert">
        <SectionLabel>Shared view</SectionLabel>
        <p className="mt-6 font-display font-light text-heading text-text-primary -tracking-[0.02em]">
          This link isn&apos;t active.
        </p>
        <p className="mt-3 text-body text-text-secondary max-w-sm mx-auto leading-relaxed">
          The link may have been revoked, expired, or never existed. Ask
          the person who sent it for a fresh link.
        </p>
      </Card>
    </div>
  );
}
