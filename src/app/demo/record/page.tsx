import Link from 'next/link';
import { METABOLIC_PERSONA_GRAPH } from '../../../../prisma/fixtures/synthetic/graph-narrative';
import type {
  DemoEdge,
  DemoNode,
  DemoSource,
} from '../../../../prisma/fixtures/demo-navigable-record';

/**
 * `/demo/record` — public read of the metabolic persona's graph fixture.
 *
 * Server-rendered. Groups conditions by specialty surface
 * (cardiometabolic, sleep-recovery, hormonal-endocrine), lists each
 * condition's supporting biomarkers and the interventions that bend
 * them, then lays out all six fixture sources as the citation trail.
 *
 * No DB. The shape is `DemoRecordFixture`, identical to what
 * `scripts/demo/seed-metabolic-persona.ts` writes — so this page reads
 * the same source-of-truth without any seed gate.
 */

export const dynamic = 'force-static';
export const runtime = 'nodejs';

interface SurfaceSpec {
  readonly key: string;
  readonly displayName: string;
  readonly conditionKeys: readonly string[];
  readonly summary: string;
}

const SURFACES: readonly SurfaceSpec[] = [
  {
    key: 'cardiometabolic',
    displayName: 'Cardiometabolic',
    conditionKeys: ['cond-prediabetes', 'cond-mild-dyslipidaemia', 'cond-stage1-htn'],
    summary:
      'Glycaemic and vascular load — HbA1c, fasting glucose, the lipid panel, and morning BP.',
  },
  {
    key: 'sleep-recovery',
    displayName: 'Sleep & recovery',
    conditionKeys: ['cond-impaired-sleep'],
    summary:
      '90-day windows from the wearable: sleep efficiency, total sleep, HRV.',
  },
  {
    key: 'hormonal-endocrine',
    displayName: 'Hormonal & endocrine',
    conditionKeys: ['cond-low-normal-test', 'cond-low-normal-ferritin'],
    summary:
      'Hormonal panel — free testosterone, ferritin, TSH as the rule-out lever.',
  },
];

export default function DemoRecordPage() {
  const fixture = METABOLIC_PERSONA_GRAPH;
  const nodesByKey = new Map(fixture.nodes.map((n) => [n.nodeKey, n]));
  const edges = fixture.edges;

  return (
    <div className="pt-8 pb-12">
      <div className="rise">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-5">
          The record — graph view
        </p>
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em]">
          {fixture.nodes.length}{' '}
          <span className="italic">nodes</span>, {fixture.edges.length} edges,{' '}
          {fixture.sources.length} sources.
        </h1>
        <p className="mt-6 max-w-xl text-body-lg text-text-secondary leading-relaxed">
          A hand-curated graph that spans three specialty surfaces. Each condition is
          grounded to a biomarker reading or wearable summary. Every edge sits inside a
          source chunk you could cite in conversation.
        </p>
      </div>

      <section className="mt-12 space-y-12">
        {SURFACES.map((surface) => (
          <SurfaceBlock
            key={surface.key}
            surface={surface}
            nodesByKey={nodesByKey}
            edges={edges}
          />
        ))}
      </section>

      <div className="rule mt-14" />

      <SourcesBlock sources={fixture.sources} />

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/demo"
          className="rounded-chip border border-border bg-surface px-4 py-2 text-caption text-text-secondary hover:border-border-strong hover:text-text-primary transition-[color,border-color] duration-300 ease-spring"
        >
          ← Overview
        </Link>
        <Link
          href="/demo/ask"
          className="rounded-chip border border-border bg-surface px-4 py-2 text-caption text-text-secondary hover:border-border-strong hover:text-text-primary transition-[color,border-color] duration-300 ease-spring"
        >
          Ask the assistant →
        </Link>
      </div>
    </div>
  );
}

function SurfaceBlock({
  surface,
  nodesByKey,
  edges,
}: {
  surface: SurfaceSpec;
  nodesByKey: Map<string, DemoNode>;
  edges: readonly DemoEdge[];
}) {
  const conditions = surface.conditionKeys
    .map((k) => nodesByKey.get(k))
    .filter((n): n is DemoNode => n !== undefined);

  return (
    <div>
      <div className="flex items-baseline gap-2.5 mb-3">
        <span className="font-mono text-label uppercase text-text-tertiary">
          {surface.key}
        </span>
      </div>
      <h2 className="font-display font-normal text-heading text-text-primary -tracking-[0.02em]">
        {surface.displayName}
      </h2>
      <p className="mt-2 text-caption text-text-tertiary leading-relaxed">
        {surface.summary}
      </p>

      <div className="mt-6 space-y-6">
        {conditions.map((cond) => (
          <ConditionRow
            key={cond.nodeKey}
            condition={cond}
            edges={edges}
            nodesByKey={nodesByKey}
          />
        ))}
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  edges,
  nodesByKey,
}: {
  condition: DemoNode;
  edges: readonly DemoEdge[];
  nodesByKey: Map<string, DemoNode>;
}) {
  const supporting = edges
    .filter((e) => e.toNodeKey === condition.nodeKey && e.type === 'SUPPORTS')
    .map((e) => nodesByKey.get(e.fromNodeKey))
    .filter((n): n is DemoNode => n !== undefined && n.type !== 'intervention');

  const interventions = edges
    .filter(
      (e) =>
        e.type === 'SUPPORTS' &&
        nodesByKey.get(e.fromNodeKey)?.type === 'intervention' &&
        // Interventions land on biomarkers — surface them through any
        // supporting biomarker to this condition.
        supporting.some((s) => s.nodeKey === e.toNodeKey),
    )
    .map((e) => nodesByKey.get(e.fromNodeKey))
    .filter((n): n is DemoNode => n !== undefined);

  // Dedup interventions by nodeKey while preserving order.
  const seen = new Set<string>();
  const uniqueInterventions = interventions.filter((n) => {
    if (seen.has(n.nodeKey)) return false;
    seen.add(n.nodeKey);
    return true;
  });

  return (
    <article className="rounded-card border border-border bg-surface px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display font-normal text-subheading text-text-primary -tracking-[0.01em]">
          {condition.displayName}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
          condition
        </span>
      </div>

      {supporting.length > 0 && (
        <div className="mt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-2">
            Supporting evidence
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {supporting.map((n) => (
              <li
                key={n.nodeKey}
                className="rounded-chip border border-border bg-surface-warm px-3 py-1 text-caption text-text-secondary"
              >
                {n.displayName}
              </li>
            ))}
          </ul>
        </div>
      )}

      {uniqueInterventions.length > 0 && (
        <div className="mt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-2">
            Interventions in play
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {uniqueInterventions.map((n) => (
              <li
                key={n.nodeKey}
                className="rounded-chip border border-positive/30 bg-positive-light px-3 py-1 text-caption text-positive"
              >
                {n.displayName}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function SourcesBlock({ sources }: { sources: readonly DemoSource[] }) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline gap-2.5 mb-4">
        <span className="font-mono text-label uppercase text-text-tertiary">Sources</span>
      </div>
      <ul className="space-y-3">
        {sources.map((s) => (
          <li key={s.sourceKey} className="border-b border-border/60 pb-3 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display font-normal text-subheading text-text-primary -tracking-[0.01em]">
                {s.label}
              </p>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                {s.kind.replaceAll('_', ' ')}
              </span>
            </div>
            <p className="mt-1 font-mono text-caption text-text-tertiary">
              Captured {formatDate(s.capturedAt)} · {s.chunks.length} chunks
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
