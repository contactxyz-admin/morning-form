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
      number: '01',
      kicker: 'Documents',
      title: 'Upload',
      blurb: 'Lab results, GP exports, hospital letters. PDFs or images.',
      done: documents.length > 0,
      doneLabel: `${documents.length} document${documents.length === 1 ? '' : 's'} staged`,
    },
    {
      href: '/intake/history',
      number: '02',
      kicker: 'Narrative',
      title: 'Your story',
      blurb: 'Free-text history. Tell us what feels relevant in your own words.',
      done: historyText.trim().length > 0,
      doneLabel: 'Saved',
    },
    {
      href: '/intake/essentials',
      number: '03',
      kicker: 'Essentials',
      title: 'The minimum',
      blurb: 'Goals, current meds, diagnoses, allergies. The bedrock of your graph.',
      done: essentialsComplete,
      doneLabel: 'Complete',
    },
  ];

  return (
    <div className="relative grain-page px-6 sm:px-8 pt-16 sm:pt-24 pb-32 max-w-2xl mx-auto">
      <header className="relative">
        <div className="flex items-center gap-3 mb-6 rise">
          <span className="inline-block w-6 h-px bg-text-primary/60" aria-hidden />
          <p className="text-label uppercase text-text-secondary">Intake</p>
        </div>
        <h1 className="font-display font-light text-display sm:text-display-2xl text-text-primary mb-6 rise">
          Bring your health
          <br />
          <span className="italic font-light text-accent">into one place.</span>
        </h1>
        <p className="text-body-lg text-text-secondary mb-4 max-w-lg rise">
          Three ways in. Use any or all — we&rsquo;ll connect what you give us into a single graph
          of your health, with sources you can check.
        </p>
        <p className="text-caption text-text-tertiary mb-14 rise">
          Takes about five minutes. Nothing is final — you can come back.
        </p>
      </header>

      <div className="space-y-3 stagger">
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
                  <div className="flex items-baseline gap-2.5 mb-2">
                    <span className="font-mono text-label uppercase text-text-tertiary">
                      {tab.number}
                    </span>
                    <span className="text-label uppercase text-text-tertiary">
                      {tab.kicker}
                    </span>
                  </div>
                  <h2 className="font-display text-heading font-normal mb-1.5 text-text-primary">
                    {tab.title}
                  </h2>
                  <p className="text-body text-text-secondary leading-relaxed">{tab.blurb}</p>
                </div>
                <div className="flex items-center gap-3 pt-1 shrink-0">
                  {tab.done && (
                    <span className="inline-flex items-center gap-1.5 text-caption text-positive font-medium whitespace-nowrap">
                      <span
                        aria-hidden
                        className="inline-block w-1.5 h-1.5 rounded-full bg-positive"
                      />
                      {tab.doneLabel}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className="text-text-tertiary group-hover:text-text-primary group-hover:translate-x-1 transition-all duration-450 ease-spring"
                  >
                    →
                  </span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-14 flex items-center justify-center gap-3" aria-hidden>
        <span className="inline-block w-16 h-px bg-border" />
        <span className="font-display text-text-whisper italic text-caption">
          listen to the record
        </span>
        <span className="inline-block w-16 h-px bg-border" />
      </div>
      <p className="mt-6 text-caption text-text-tertiary text-center px-4 max-w-md mx-auto leading-relaxed">
        Staged documents stay until you finish intake. Page reloads will clear them.
      </p>
    </div>
  );
}
