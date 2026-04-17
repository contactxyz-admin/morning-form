/**
 * Named sub-processor disclosure (U18). Rendered on /settings/privacy so the
 * user can see exactly who their Article 9 data is processed by, under what
 * purpose, and across which border.
 *
 * Changes to this list require updating `docs/compliance/sub-processor-register.md`
 * in the same PR — the committed register is the source of truth for legal;
 * this component is the user-facing projection of it.
 */

export interface SubProcessor {
  name: string;
  purpose: string;
  jurisdiction: string;
  dataCategories: string;
  transferMechanism?: string;
}

export const SUB_PROCESSORS: SubProcessor[] = [
  {
    name: 'Anthropic PBC',
    purpose:
      'LLM inference for intake extraction, topic-page compilation, daily brief, and clinician-prep output.',
    jurisdiction: 'United States',
    dataCategories:
      'Free-text intake, biomarker values keyed to a canonical registry, wearable-derived metrics. No direct identifiers where avoidable.',
    transferMechanism:
      'UK-US Data Bridge adequacy decision; fallback Standard Contractual Clauses. Zero-retention and no-training commitments under executed DPA.',
  },
  {
    name: 'Terra API',
    purpose:
      'Health-provider aggregation for wearable data (Apple Health, Fitbit, Garmin, Oura, Whoop).',
    jurisdiction: 'United States',
    dataCategories:
      'Wearable metrics (sleep, activity, recovery, heart rate) and provider-issued identifiers only — no free-text intake or biomarker values.',
    transferMechanism: 'Standard Contractual Clauses.',
  },
  {
    name: 'Resend',
    purpose: 'Magic-link authentication email delivery.',
    jurisdiction: 'United States',
    dataCategories:
      'Email address and one-time-use sign-in token. No health data.',
    transferMechanism: 'Standard Contractual Clauses.',
  },
  {
    name: 'Vercel',
    purpose: 'Application hosting, edge routing, and deployment infrastructure.',
    jurisdiction: 'United States (EU data region where available)',
    dataCategories: 'Request metadata and encrypted-in-transit payload only.',
    transferMechanism: 'Standard Contractual Clauses.',
  },
  {
    name: 'Neon',
    purpose: 'Managed Postgres for application data storage.',
    jurisdiction: 'United Kingdom (EU region, encrypted at rest)',
    dataCategories:
      'All application data — graph nodes, source documents, chunks, topic pages, sessions.',
  },
];

export function SubProcessorList() {
  return (
    <div className="space-y-5">
      {SUB_PROCESSORS.map((p) => (
        <div key={p.name} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-body text-text-primary">{p.name}</h3>
            <span className="font-mono text-caption text-text-tertiary uppercase tracking-wide whitespace-nowrap">
              {p.jurisdiction}
            </span>
          </div>
          <p className="text-caption text-text-secondary max-w-prose">{p.purpose}</p>
          <p className="text-caption text-text-tertiary max-w-prose">
            <span className="text-text-secondary">Data categories:</span> {p.dataCategories}
          </p>
          {p.transferMechanism && (
            <p className="text-caption text-text-tertiary max-w-prose">
              <span className="text-text-secondary">Transfer mechanism:</span> {p.transferMechanism}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
