import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { resolveShare, markShareViewed } from '@/lib/share/tokens';
import { redactTopicOutput } from '@/lib/share/redact';
import { getTopicConfig } from '@/lib/topics/registry';
import { TopicCompiledOutputSchema } from '@/lib/topics/types';
import type { TopicCompiledOutput } from '@/lib/topics/types';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { ThreeTierSection } from '@/components/topic/three-tier-section';
import { GPPrepCard } from '@/components/topic/gp-prep-card';

/**
 * Public SSR share page.
 *
 * No auth. Token is the long-random credential. We deliberately never
 * recompile on this path — unauthenticated viewers must not be able to
 * drive LLM work on the owner's behalf. If the owner hasn't opened the
 * topic yet (no cached TopicPage row, or it's stale), we render a polite
 * "not available" card.
 *
 * `markShareViewed` increments a view counter + lastViewedAt on every
 * hit, so the owner can see usage on /settings/shared-links.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Shared health view',
  // Extra belt-and-braces; middleware also sets X-Robots-Tag: noindex.
  robots: { index: false, follow: false, nocache: true },
};

interface Props {
  params: { token: string };
}

export default async function SharePage({ params }: Props) {
  const resolved = await resolveShare(prisma, params.token);
  if (!resolved) {
    notFound();
  }

  // Fire-and-forget view counter; do not block the render on the update.
  markShareViewed(prisma, resolved.id).catch((err) => {
    console.error('[share] markShareViewed failed:', err);
  });

  if (resolved.scope.kind === 'topic') {
    return <SharedTopic topicKey={resolved.scope.topicKey} label={resolved.label} userId={resolved.userId} redactions={resolved.redactions} />;
  }

  // Node scope is intentionally out of MVP. Render a placeholder.
  return <SharedUnavailable label={resolved.label} reason="node-scope-not-implemented" />;
}

async function SharedTopic({
  topicKey,
  label,
  userId,
  redactions,
}: {
  topicKey: string;
  label: string | null;
  userId: string;
  redactions: { hideNodeIds?: string[] };
}) {
  const config = getTopicConfig(topicKey);
  const displayName = config?.displayName ?? topicKey;

  const cached = await prisma.topicPage.findUnique({
    where: { userId_topicKey: { userId, topicKey } },
  });

  if (!cached || cached.status !== 'full' || !cached.rendered) {
    return <SharedUnavailable label={label} reason="topic-not-ready" />;
  }

  let output: TopicCompiledOutput;
  try {
    const parsed = TopicCompiledOutputSchema.safeParse(JSON.parse(cached.rendered));
    if (!parsed.success) {
      return <SharedUnavailable label={label} reason="topic-invalid" />;
    }
    output = parsed.data;
  } catch {
    return <SharedUnavailable label={label} reason="topic-invalid" />;
  }

  const { output: redacted, hadRedactions } = redactTopicOutput(output, redactions);

  return (
    <div className="px-5 pt-6 grain-page pb-24">
      <ShareBanner label={label} hadRedactions={hadRedactions} />

      <header className="mt-8 rise">
        <SectionLabel>{displayName}</SectionLabel>
        <h1 className="mt-4 font-display font-light text-display-xl sm:text-display-2xl text-text-primary -tracking-[0.045em] leading-[0.98]">
          {redacted.understanding.heading}
        </h1>
      </header>

      <div className="mt-14 space-y-14 stagger">
        <ThreeTierSection
          ordinal="01"
          kicker="Understanding"
          accent="teal"
          section={redacted.understanding}
        />
        <ThreeTierSection
          ordinal="02"
          kicker="What you can do now"
          accent="sage"
          section={redacted.whatYouCanDoNow}
        />
        <ThreeTierSection
          ordinal="03"
          kicker="Discuss with a clinician"
          accent="amber"
          section={redacted.discussWithClinician}
        />
      </div>

      <GPPrepCard gpPrep={redacted.gpPrep} />
    </div>
  );
}

function ShareBanner({ label, hadRedactions }: { label: string | null; hadRedactions: boolean }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-paper/60 px-4 py-3 text-caption text-text-secondary">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
        <span className="uppercase tracking-wider font-mono text-label">Shared view</span>
      </div>
      {label && <p className="mt-1 text-body text-text-primary">{label}</p>}
      <p className="mt-1 leading-relaxed">
        A read-only snapshot from someone&apos;s health record.
        {hadRedactions && ' Some content has been hidden by the owner.'}
      </p>
    </div>
  );
}

function SharedUnavailable({
  label,
  reason,
}: {
  label: string | null;
  reason: 'topic-not-ready' | 'topic-invalid' | 'node-scope-not-implemented';
}) {
  const message =
    reason === 'topic-not-ready'
      ? "The owner hasn't compiled this topic yet. Check back shortly."
      : reason === 'topic-invalid'
      ? "This shared view couldn't be rendered from the latest data."
      : 'This share type is not available in this preview.';
  return (
    <div className="px-5 pt-6 grain-page pb-24">
      <Card variant="paper" className="py-12 text-center">
        <SectionLabel>Shared view</SectionLabel>
        {label && (
          <p className="mt-4 text-body text-text-secondary">{label}</p>
        )}
        <p className="mt-6 font-display font-light text-heading text-text-primary -tracking-[0.02em]">
          Not available right now.
        </p>
        <p className="mt-3 text-body text-text-secondary max-w-sm mx-auto leading-relaxed">
          {message}
        </p>
      </Card>
    </div>
  );
}
