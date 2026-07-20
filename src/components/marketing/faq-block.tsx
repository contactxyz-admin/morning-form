import type { MarketingFaqEntry } from '@/lib/marketing/page-schema';

interface FaqBlockProps {
  entries: ReadonlyArray<MarketingFaqEntry>;
  /** Anchor id for a page nav link (e.g. "faq"). Omit when unlinked. */
  id?: string;
}

export function FaqBlock({ entries, id }: FaqBlockProps) {
  if (entries.length === 0) return null;
  return (
    <section id={id} className="scroll-mt-24 px-6 sm:px-10 lg:px-16 py-24 sm:py-32 border-t border-border max-w-[1400px] mx-auto">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-10">
        Frequently asked
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 max-w-5xl">
        {entries.map((e, i) => (
          <div key={i}>
            <h3 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
              {e.question}
            </h3>
            <p className="mt-3 text-body text-text-secondary leading-relaxed">{e.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
