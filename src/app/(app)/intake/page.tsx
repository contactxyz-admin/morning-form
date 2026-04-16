'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { useIntakeStore } from '@/lib/intake/store';

export default function IntakeLandingPage() {
  const documents = useIntakeStore((s) => s.documents);
  const historyText = useIntakeStore((s) => s.historyText);
  const essentialsComplete = useIntakeStore((s) => s.isEssentialsComplete());

  const tabs = [
    {
      href: '/intake/upload',
      title: 'Upload',
      blurb: 'Lab results, GP exports, hospital letters. PDFs or images.',
      done: documents.length > 0,
      doneLabel: `${documents.length} document${documents.length === 1 ? '' : 's'} staged`,
    },
    {
      href: '/intake/history',
      title: 'Your story',
      blurb: 'Free-text history. Tell us what feels relevant in your own words.',
      done: historyText.trim().length > 0,
      doneLabel: 'Saved',
    },
    {
      href: '/intake/essentials',
      title: 'Essentials',
      blurb: 'Goals, current meds, diagnoses, allergies. The minimum we need.',
      done: essentialsComplete,
      doneLabel: 'Complete',
    },
  ];

  return (
    <div className="px-5 pt-6 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h1 className="text-display font-semibold mb-2">Bring your health data here</h1>
        <p className="text-body text-text-secondary mb-8">
          Three ways in. Use any or all of them — we&rsquo;ll connect what you give us into a single
          graph of your health, with sources you can check.
        </p>
      </motion.div>

      <div className="space-y-3">
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href} className="block">
            <Card
              variant="action"
              accentColor={tab.done ? 'sage' : 'teal'}
              clickable
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-heading font-semibold mb-1">{tab.title}</h2>
                  <p className="text-body text-text-secondary">{tab.blurb}</p>
                </div>
                {tab.done && (
                  <span className="text-caption text-positive font-medium whitespace-nowrap">
                    ✓ {tab.doneLabel}
                  </span>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-caption text-text-tertiary text-center px-4">
        Staged documents stay until you finish intake. Page reloads will clear them.
      </p>
    </div>
  );
}
