import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * /contact — deliberately small while in private beta.
 *
 * privacy@morningform.health is the one operationally live mailbox
 * (Settings → Privacy and docs/compliance/* both point at it), so it
 * carries general enquiries too for now. When the general address from
 * the deck ships (hello@ — pending domain DNS, see .env.example), add
 * it here and narrow the privacy address back to data requests.
 */

export const metadata: Metadata = {
  title: 'Contact — Morning Form',
  description: 'How to reach Morning Form during the private beta.',
};

const SECTION_HEADING = 'font-display font-normal text-heading text-text-primary -tracking-[0.02em]';
const BODY = 'mt-3 text-body text-text-secondary leading-relaxed';
const LINK_CLASS =
  'text-text-primary underline underline-offset-4 decoration-border-strong hover:decoration-text-primary transition-colors';

export default function ContactPage() {
  return (
    <article>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
        Contact
      </p>
      <h1 className="mt-6 font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.02]">
        Reaching us.
      </h1>
      <p className="mt-6 text-body-lg text-text-secondary leading-relaxed max-w-xl">
        Morning Form is in private beta, and the team is small. One address
        reaches us.
      </p>

      <div className="mt-16 flex flex-col gap-12">
        <section>
          <h2 className={SECTION_HEADING}>Email</h2>
          <p className={BODY}>
            <a href="mailto:privacy@morningform.health" className={LINK_CLASS}>
              privacy@morningform.health
            </a>{' '}
            — for data and privacy requests (access, correction, erasure),
            and for general questions while we are in beta. Exporting or
            deleting your record does not need an email at all: both are
            self-serve in settings.
          </p>
        </section>

        <section>
          <h2 className={SECTION_HEADING}>See it instead</h2>
          <p className={BODY}>
            The fastest way to understand Morning Form is the{' '}
            <Link href="/demo" className={LINK_CLASS}>
              live demo
            </Link>{' '}
            — a complete synthetic record you can explore without an account.
            Already a member?{' '}
            <Link href="/sign-in" className={LINK_CLASS}>
              Sign in
            </Link>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
