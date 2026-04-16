'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { useIntakeStore } from '@/lib/intake/store';

export default function IntakeLandingPage() {
  const documents = useIntakeStore((s) => s.documents);
  const historyText = useIntakeStore((s) => s.historyText);
  const essentialsComplete = useIntakeStore((s) => s.isEssentialsComplete());

  const tabs = [
    {
      href: '/intake/upload',
      eyebrow: '01 — Documents',
      title: 'Upload',
      blurb: 'Lab results, GP exports, hospital letters. PDFs or images.',
      done: documents.length > 0,
      doneLabel: `${documents.length} document${documents.length === 1 ? '' : 's'} staged`,
    },
    {
      href: '/intake/history',
      eyebrow: '02 — Narrative',
      title: 'Your story',
      blurb: 'Free-text history. Tell us what feels relevant in your own words.',
      done: historyText.trim().length > 0,
      doneLabel: 'Saved',
    },
    {
      href: '/intake/essentials',
      eyebrow: '03 — Essentials',
      title: 'The minimum',
      blurb: 'Goals, current meds, diagnoses, allergies. The bedrock of your graph.',
      done: essentialsComplete,
      doneLabel: 'Complete',
    },
  ];

  return (
    <div className="px-6 sm:px-8 pt-12 sm:pt-20 pb-32 max-w-2xl mx-auto">
      <div className="stagger">
        <p className="text-label uppercase text-text-tertiary mb-5">
          Intake
        </p>
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary mb-5 -tracking-[0.04em]">
          Bring your health
          <br />
          <span className="italic font-light">into one place.</span>
        </h1>
        <p className="text-body-lg text-text-secondary mb-12 max-w-lg">
          Three ways in. Use any or all — we&rsquo;ll connect what you give us into a single graph
          of your health, with sources you can check.
        </p>

        <div className="space-y-3">
          {tabs.map((tab) => (
            <Link key={tab.href} href={tab.href} className="block group">
              <Card
                variant="action"
                accentColor={tab.done ? 'sage' : 'teal'}
                clickable
                className="pl-7"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <p className="text-label uppercase text-text-tertiary mb-2">
                      {tab.eyebrow}
                    </p>
                    <h2 className="font-display text-heading font-normal mb-1.5 text-text-primary">
                      {tab.title}
                    </h2>
                    <p className="text-body text-text-secondary leading-relaxed">{tab.blurb}</p>
                  </div>
                  <div className="flex items-center gap-3 pt-1 shrink-0">
                    {tab.done && (
                      <span className="text-caption text-positive font-medium whitespace-nowrap">
                        {tab.doneLabel}
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="text-text-tertiary group-hover:text-text-primary group-hover:translate-x-0.5 transition-all duration-450 ease-spring"
                    >
                      →
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <p className="mt-12 text-caption text-text-tertiary text-center px-4 max-w-md mx-auto leading-relaxed">
          Staged documents stay until you finish intake. Page reloads will clear them.
        </p>
      </div>
    </div>
  );
}
