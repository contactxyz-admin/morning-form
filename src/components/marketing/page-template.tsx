import { MarketingHeader, DASH_BULLET } from './marketing-header';
import { MarketingFooter } from './marketing-footer';
import { CtaBlock } from './cta-block';
import { HeroBlock } from './hero-block';
import { FaqBlock } from './faq-block';
import { EscalationModule } from './escalation-module';
import { COHORTS } from '@/lib/marketing/cohorts';
import type { MarketingPage } from '@/lib/marketing/page-schema';

interface PageTemplateProps {
  page: MarketingPage;
}

/**
 * The single TSX template that renders every marketing page from data.
 *
 * Sections render from a fixed schema (hero / sections / faq /
 * escalation / cta) — never freeform components. This rigidity is the
 * thing that makes the editorial-QA Vitest gate effective: regexes
 * scan flat strings, not component trees.
 */
export function PageTemplate({ page }: PageTemplateProps) {
  const cohortLabel = COHORTS[page.cohortKey].label;
  const eyebrow = `${cohortLabel} · ${page.market.toUpperCase()}`;

  return (
    <div className="min-h-screen bg-bg">
      <MarketingHeader
        homeHref={`/${page.market}`}
        navLinks={[
          { label: 'Home', href: `/${page.market}` },
          { label: 'Testing', href: `/${page.market}/testing` },
          { label: 'Live demo', href: '/demo' },
          { label: 'Sign in', href: '/sign-in' },
        ]}
      />

      <main>
        <HeroBlock page={page} eyebrow={eyebrow} />

      {/* Body sections — typed flat strings, scanned by editorial-QA. */}
      <article className="px-6 sm:px-10 lg:px-16 pb-16 sm:pb-24 max-w-[1400px] mx-auto">
        <div className="max-w-3xl space-y-12">
          {page.sections.map((section, i) => (
            <section key={i}>
              {section.heading ? (
                <h2 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em] mb-5">
                  {section.heading}
                </h2>
              ) : null}
              <div className="space-y-4">
                {section.paragraphs.map((p, j) => (
                  <p key={j} className="text-body text-text-secondary leading-relaxed">{p}</p>
                ))}
              </div>
              {section.bullets && section.bullets.length > 0 ? (
                <ul className="mt-5 space-y-2 text-body text-text-secondary">
                  {section.bullets.map((b, k) => (
                    <li key={k} className={DASH_BULLET}>
                      {b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>

      <EscalationModule escalation={page.escalation} />

      {page.faq && page.faq.length > 0 ? <FaqBlock entries={page.faq} /> : null}

      {/* Final CTA — restate the conversion ask. */}
      <section className="px-6 sm:px-10 lg:px-16 py-24 sm:py-32 border-t border-border max-w-[1400px] mx-auto">
        <h2 className="font-display font-light text-display sm:text-display-xl text-text-primary max-w-3xl -tracking-[0.04em] leading-[1.02]">
          See what your numbers have been trying to tell you.
        </h2>
        <div className="mt-12">
          <CtaBlock
            cta={page.cta}
            market={page.market}
            cohort={page.cohortKey}
            slug={page.slug}
          />
        </div>
      </section>
      </main>

      <MarketingFooter
        market={page.market}
        extraLine={`Last reviewed ${new Date(page.lastReviewedAt).toLocaleDateString(page.market === 'uk' ? 'en-GB' : 'en-US')}`}
      />
    </div>
  );
}
