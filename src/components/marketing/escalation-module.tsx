import type { MarketingEscalation } from '@/lib/marketing/page-schema';
import { DASH_BULLET } from './marketing-header';

interface EscalationModuleProps {
  escalation: MarketingEscalation;
}

/**
 * Standardised "when to speak to a clinician" panel.
 *
 * Path A regulatory posture: this is rendered as static page copy, not a
 * personalised recommendation. Every page has it; the editorial-QA gate
 * scans the same string sources for forbidden phrases.
 */
export function EscalationModule({ escalation }: EscalationModuleProps) {
  return (
    <section className="px-6 sm:px-10 lg:px-16 py-20 sm:py-28 border-t border-border max-w-[1400px] mx-auto">
      <div className="rounded-card border border-border bg-surface-warm p-7 sm:p-10 max-w-3xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">
          When to speak to a clinician
        </p>
        <h2 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
          {escalation.heading}
        </h2>
        {escalation.paragraphs.map((p, i) => (
          <p key={i} className="mt-4 text-body text-text-secondary leading-relaxed">
            {p}
          </p>
        ))}
        {escalation.bullets && escalation.bullets.length > 0 ? (
          <ul className="mt-5 space-y-2 text-body text-text-secondary">
            {escalation.bullets.map((b, i) => (
              <li key={i} className={DASH_BULLET}>
                {b}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
