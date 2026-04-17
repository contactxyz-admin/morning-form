'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Disclaimer } from '@/components/ui/disclaimer';
import { SubProcessorList } from '@/components/ui/sub-processor-list';

/**
 * /settings/privacy (U18).
 *
 * User-facing landing for regulatory disclosures: intended purpose, sub-
 * processors with transfer mechanisms, and the data-subject contact route.
 * The committed source of truth lives in docs/compliance/sub-processor-register.md;
 * this page is the projection of it.
 */
export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div className="px-5 pt-6 pb-8 grain-page">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring"
          >
            <Icon name="back" size="md" />
          </button>
          <span className="text-label uppercase text-text-tertiary">Privacy</span>
        </div>
      </div>

      <div className="rise">
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary mb-6 -tracking-[0.04em]">
          Your data.
        </h1>
        <Disclaimer />
      </div>

      <div className="space-y-12 stagger mt-12">
        <section>
          <div className="flex items-baseline gap-2.5 mb-5">
            <span className="font-mono text-label uppercase text-text-tertiary">01</span>
            <span className="text-label uppercase text-text-tertiary">Sub-processors</span>
          </div>
          <p className="text-caption text-text-secondary max-w-prose mb-6">
            Named third parties that process your data under contract. Each entry
            lists the purpose, jurisdiction, data categories, and cross-border
            transfer mechanism where applicable.
          </p>
          <SubProcessorList />
        </section>

        <div className="rule" />

        <section>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">02</span>
            <span className="text-label uppercase text-text-tertiary">Your rights</span>
          </div>
          <p className="text-caption text-text-secondary max-w-prose mb-3">
            You have the right to access, rectify, export, and erase your data at
            any time. Data export and account deletion are available under
            Settings → Data.
          </p>
          <p className="text-caption text-text-secondary max-w-prose">
            For data-subject requests or withdrawal of consent to LLM processing,
            contact{' '}
            <a
              href="mailto:privacy@morningform.health"
              className="text-accent hover:underline underline-offset-4"
            >
              privacy@morningform.health
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
