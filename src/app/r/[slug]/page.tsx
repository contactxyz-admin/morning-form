import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { resolveDemoSlug } from '@/lib/record/demo';
import { listTopicConfigs } from '@/lib/topics/registry';
import { TopicCompiledOutputSchema } from '@/lib/topics/types';
import type { TopicCompiledOutput } from '@/lib/topics/types';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { ThreeTierSection } from '@/components/topic/three-tier-section';
import { GPPrepCard } from '@/components/topic/gp-prep-card';

/**
 * Public demo-record page, served at `/r/[slug]`.
 *
 * Mirrors the safety posture of `/share/[token]`:
 *   - No auth, no cookies, no session.
 *   - Never recompiles. Reads pre-compiled `TopicPage.rendered` only.
 *   - Middleware sets noindex / noframe / no-store headers.
 *
 * Differs from share in that the slug resolves to a hand-curated demo
 * user id (see `src/lib/record/demo.ts`), not a user-minted random
 * token. Stable across re-seeds: rebuilding the demo user keeps the
 * URL working as long as the slug still points at the new user id.
 *
 * No redactions layer: the demo user's graph is seeded from scratch
 * and is public by construction, so there is nothing sensitive to hide.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Props {
  params: { slug: string };
}

interface TopicEntry {
  topicKey: string;
  displayName: string;
  output: TopicCompiledOutput;
}

export default async function DemoRecordPage({ params }: Props) {
  const record = resolveDemoSlug(params.slug);
  if (!record) notFound();

  // Email is the stable demo identifier — `User.id` is a cuid that
  // changes on every fresh DB, but the seed always re-creates this
  // email. 404 (not 500) if the seed hasn't run yet on a new env.
  const user = await prisma.user.findUnique({
    where: { email: record.email },
    select: { id: true },
  });
  if (!user) notFound();

  const topics = await loadCompiledTopics(user.id);

  return (
    <div className="min-h-screen bg-record-grid px-5 pt-6 grain-page pb-24">
      <DemoBanner />

      {topics.length === 0 ? (
        <Card variant="paper" className="mt-8 py-12 text-center">
          <SectionLabel>Record preview</SectionLabel>
          <p className="mt-6 font-display font-light text-heading text-text-primary -tracking-[0.02em]">
            Nothing here yet.
          </p>
          <p className="mt-3 text-body text-text-secondary max-w-sm mx-auto leading-relaxed">
            This demo is still being seeded. Check back shortly.
          </p>
        </Card>
      ) : (
        <>
          <TopicIndex topics={topics} />
          <div className="mt-16 space-y-24">
            {topics.map((t) => (
              <TopicSection key={t.topicKey} entry={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

async function loadCompiledTopics(userId: string): Promise<TopicEntry[]> {
  const configs = listTopicConfigs();
  const configByKey = new Map(configs.map((c) => [c.topicKey, c]));
  const pages = await prisma.topicPage.findMany({
    where: { userId, status: 'full' },
    select: { topicKey: true, rendered: true },
  });

  const entries: TopicEntry[] = [];
  for (const page of pages) {
    const config = configByKey.get(page.topicKey);
    if (!config || !page.rendered) continue;
    try {
      const parsed = TopicCompiledOutputSchema.safeParse(JSON.parse(page.rendered));
      if (!parsed.success) continue;
      entries.push({
        topicKey: page.topicKey,
        displayName: config.displayName,
        output: parsed.data,
      });
    } catch {
      // Malformed row — skip quietly. Demo should still render
      // whatever is valid.
      continue;
    }
  }

  // Order by the registry's declared order so the demo feels curated,
  // not alphabetized.
  const orderByKey = new Map(configs.map((c, i) => [c.topicKey, i]));
  entries.sort(
    (a, b) =>
      (orderByKey.get(a.topicKey) ?? 0) - (orderByKey.get(b.topicKey) ?? 0),
  );
  return entries;
}

function DemoBanner() {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-paper/60 px-4 py-3 text-caption text-text-secondary">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
        <span className="uppercase tracking-wider font-mono text-label">
          Demo record
        </span>
      </div>
      <p className="mt-1 leading-relaxed">
        A preview of the health record, compiled from a seeded example.
        Not a real person&apos;s data.
      </p>
    </div>
  );
}

function TopicIndex({ topics }: { topics: TopicEntry[] }) {
  return (
    <nav aria-label="Topics" className="mt-8">
      <SectionLabel>Topics</SectionLabel>
      <ul className="mt-3 flex flex-wrap gap-2">
        {topics.map((t) => (
          <li key={t.topicKey}>
            <Link
              href={`#topic-${t.topicKey}`}
              className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-caption text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors duration-300 ease-spring"
            >
              {t.displayName}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TopicSection({ entry }: { entry: TopicEntry }) {
  const { output, displayName, topicKey } = entry;
  return (
    <section id={`topic-${topicKey}`} className="scroll-mt-12">
      <header className="rise">
        <SectionLabel>{displayName}</SectionLabel>
        <h1 className="mt-4 font-display font-light text-display-xl sm:text-display-2xl text-text-primary -tracking-[0.045em] leading-[0.98]">
          {output.understanding.heading}
        </h1>
      </header>

      <div className="mt-14 space-y-14 stagger">
        <ThreeTierSection
          ordinal="01"
          kicker="Understanding"
          accent="teal"
          section={output.understanding}
        />
        <ThreeTierSection
          ordinal="02"
          kicker="What you can do now"
          accent="sage"
          section={output.whatYouCanDoNow}
        />
        <ThreeTierSection
          ordinal="03"
          kicker="Discuss with a clinician"
          accent="amber"
          section={output.discussWithClinician}
        />
      </div>

      <GPPrepCard gpPrep={output.gpPrep} />
    </section>
  );
}
