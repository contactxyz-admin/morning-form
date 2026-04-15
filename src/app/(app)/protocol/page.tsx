'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { Icon } from '@/components/ui/icon';
import { SubscriptionStatusBadge } from '@/components/subscription/subscription-status-badge';
import { mockProtocol, mockProtocolItems } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

interface SubscriptionSummary {
  status: string;
  currentPeriodEnd: string;
  monthlyTotalCents: number;
  items: { id: string; product: { name: string } }[];
}

export default function ProtocolPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [packCompoundCount, setPackCompoundCount] = useState(0);
  const [packPriceCents, setPackPriceCents] = useState(0);

  useEffect(() => {
    fetch('/api/subscription')
      .then((res) => res.json())
      .then((data: { subscription: SubscriptionSummary | null }) => setSubscription(data.subscription))
      .catch(console.error);

    fetch('/api/products/protocol')
      .then((res) => res.json())
      .then((data: { pack: { packCompounds: unknown[]; priceInCents: number } | null }) => {
        if (data.pack) {
          setPackCompoundCount(data.pack.packCompounds.length);
          setPackPriceCents(data.pack.priceInCents);
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="px-5 pt-6 pb-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-heading font-medium text-text-primary">Your Protocol</h1>
        <span className="text-caption text-text-tertiary font-mono">v{mockProtocol.version}</span>
      </div>
      <p className="text-body text-text-secondary mb-8">
        Designed for sustained activation → clean downshift
      </p>

      {/* Timeline */}
      <div className="relative pl-8">
        <div className="absolute left-3 top-4 bottom-4 w-px bg-border" />

        {mockProtocolItems.map((item) => {
          const isExpanded = expanded === item.id;
          return (
            <div key={item.id} className="relative mb-6 last:mb-0">
              <div className={cn(
                'absolute -left-5 top-6 w-2.5 h-2.5 rounded-full border-2 border-bg transition-colors',
                isExpanded ? 'bg-accent' : 'bg-accent/50'
              )} />

              <Card
                variant="default"
                clickable
                onClick={() => setExpanded(isExpanded ? null : item.id)}
                className="cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <SectionLabel>{item.timeLabel}</SectionLabel>
                    <h3 className="mt-2 text-subheading font-medium text-text-primary">{item.compounds}</h3>
                    <p className="mt-1 font-mono text-data text-accent">{item.dosage}</p>
                    <p className="mt-1 text-caption text-text-tertiary">{item.timingCue}</p>
                  </div>
                  <Icon
                    name="chevron-down"
                    size="sm"
                    className={cn('text-text-tertiary transition-transform mt-1', isExpanded && 'rotate-180')}
                  />
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-body text-text-secondary leading-relaxed">{item.mechanism}</p>
                        <div className="mt-4 flex items-center gap-2">
                          <span className="text-caption text-text-tertiary">Evidence tier:</span>
                          <span className="text-caption font-medium text-positive capitalize">{item.evidenceTier}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Confidence */}
      <Card variant="contextual" className="mt-8">
        <p className="text-caption text-text-secondary">
          <span className="font-medium text-accent">Confidence: {mockProtocol.confidence}</span> — Your profile maps clearly to well-studied compounds.
        </p>
      </Card>

      {/* Subscription CTA */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-6">
        {subscription ? (
          <Card variant="default">
            <div className="flex items-center justify-between mb-2">
              <SectionLabel>SUPPLEMENTS</SectionLabel>
              <SubscriptionStatusBadge status={subscription.status} />
            </div>
            <p className="text-body text-text-secondary">
              {subscription.items.length} compound{subscription.items.length !== 1 ? 's' : ''} · £{(subscription.monthlyTotalCents / 100).toFixed(2)}/mo
            </p>
            {subscription.status === 'active' && (
              <p className="mt-1 text-caption text-text-tertiary">
                Next delivery {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
              </p>
            )}
            <Link href="/settings/subscription" className="mt-3 inline-block text-caption text-accent font-medium hover:underline">
              Manage subscription →
            </Link>
          </Card>
        ) : (
          <Card variant="action" accentColor="teal" clickable>
            <Link href="/protocol/subscribe" className="block">
              <SectionLabel>GET THESE SUPPLEMENTS</SectionLabel>
              <p className="mt-2 text-body text-text-secondary">
                Your protocol — {packCompoundCount} compounds, delivered monthly.
              </p>
              {packPriceCents > 0 && (
                <p className="mt-1 font-mono text-data text-accent">
                  From £{(packPriceCents / 100).toFixed(2)}/mo
                </p>
              )}
              <p className="mt-3 text-caption text-accent font-medium">Subscribe →</p>
            </Link>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
