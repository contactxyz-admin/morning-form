import type { Metadata } from 'next';

/**
 * /privacy — plain-English summary of how Morning Form handles data.
 *
 * Facts only, each grounded in the codebase: export (src/lib/account/
 * export.ts), deletion (src/app/api/account/delete/*), sub-processors
 * (src/components/ui/sub-processor-list.tsx + docs/compliance/
 * sub-processor-register.md), consent (src/components/auth/
 * llm-consent-modal.tsx), lawful basis (docs/compliance/dpia.md),
 * cookies (src/lib/marketing/constants.ts). If behaviour changes,
 * update this page in the same PR.
 */

export const metadata: Metadata = {
  title: 'Privacy — Morning Form',
  description:
    'How Morning Form handles your health data: never sold, never used for advertising, exportable and deletable in full, AI processing only with your explicit consent.',
};

const SUB_PROCESSORS: ReadonlyArray<{ name: string; role: string }> = [
  {
    name: 'Anthropic (United States)',
    role: 'AI interpretation of your record, under a zero-retention, no-training contract.',
  },
  {
    name: 'Terra API (United States)',
    role: 'Wearable-provider aggregation — sleep, activity, recovery and heart metrics only.',
  },
  {
    name: 'Resend (United States)',
    role: 'Sign-in email delivery. Sees your email address and a one-time sign-in token, never health data.',
  },
  {
    name: 'Vercel (United States)',
    role: 'Application hosting and deployment. Request metadata and encrypted-in-transit payloads only.',
  },
  {
    name: 'Neon (United Kingdom)',
    role: 'The database itself — London region, encrypted at rest.',
  },
];

const SECTION_HEADING = 'font-display font-normal text-heading text-text-primary -tracking-[0.02em]';
const BODY = 'mt-3 text-body text-text-secondary leading-relaxed';

export default function PrivacyPage() {
  return (
    <article>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
        Privacy
      </p>
      <h1 className="mt-6 font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.02]">
        Your record is yours.
      </h1>
      <p className="mt-6 text-body-lg text-text-secondary leading-relaxed max-w-xl">
        A plain-English summary of how Morning Form handles your data. The
        short version: it is never sold, never used for advertising, you can
        export all of it, and you can delete all of it.
      </p>

      <div className="mt-16 flex flex-col gap-12">
        <section>
          <h2 className={SECTION_HEADING}>What Morning Form holds</h2>
          <p className={BODY}>
            What you give it: wearable metrics from the providers you connect,
            blood panels you upload and the values read from them, daily
            check-ins, your conversations with Ask, and the email address you
            sign in with. For visitors who are not signed in, we set two
            first-party cookies — one remembers which market site to show you,
            one lets us recognise a returning visitor. There are no
            third-party analytics or advertising scripts on any page.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Where it lives</h2>
          <p className={BODY}>
            Your record is stored in a UK-region database (London), encrypted
            at rest. Uploaded documents sit in private storage — they are
            never exposed at public URLs, and downloading them requires your
            signed-in session. Everything moves over encrypted connections.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>AI processing — only with your consent</h2>
          <p className={BODY}>
            Morning Form asks for your explicit consent before any AI
            processing of your health data, and you can withdraw it at any
            time in Settings → Privacy. Interpretation runs through Anthropic
            (United States) under a contract that commits to zero retention
            and no training on your data. The cross-border transfer is covered
            by the UK–US Data Bridge adequacy decision, with Standard
            Contractual Clauses as fallback.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Who else touches data, and why</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {SUB_PROCESSORS.map((s) => (
              <li key={s.name} className="text-body text-text-secondary leading-relaxed">
                <span className="text-text-primary font-medium">{s.name}.</span>{' '}
                {s.role}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Your controls</h2>
          <p className={BODY}>
            Export: from settings you can request a complete archive of your
            record — every data category as readable files, plus the original
            documents you uploaded. Delete: account deletion is available from
            settings, confirmed by email, and is permanent and immediate once
            you confirm — your record, documents, and connections are all
            erased.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Legal basis</h2>
          <p className={BODY}>
            We process your data to provide the service you asked for
            (UK GDPR Article 6(1)(b)), and we process health data — special
            category data — only with your explicit consent
            (Article 9(2)(a)), captured at onboarding and withdrawable at any
            time.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>Questions or requests</h2>
          <p className={BODY}>
            For any data-subject request — access, correction, erasure — or
            any privacy question, write to{' '}
            <a
              href="mailto:privacy@morningform.health"
              className="text-text-primary underline underline-offset-4 decoration-border-strong hover:decoration-text-primary transition-colors"
            >
              privacy@morningform.health
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
