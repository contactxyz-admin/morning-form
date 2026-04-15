'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/ui/section-label';
import { CompoundRow } from '@/components/subscription/compound-row';
import { SubscriptionStatusBadge } from '@/components/subscription/subscription-status-badge';
import type { Product } from '@/types';

interface SubscriptionData {
  id: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  monthlyTotalCents: number;
  items: { id: string; product: Product; quantity: number; isFromProtocol: boolean }[];
  orders: { id: string; status: string; trackingNumber: string | null; createdAt: string }[];
}

export default function SubscriptionManagementPage() {
  const router = useRouter();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const fetchSubscription = async () => {
    try {
      const res = await fetch('/api/subscription');
      const data = await res.json() as { subscription: SubscriptionData | null };
      setSubscription(data.subscription);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, []);

  const handleAction = async (action: 'pause' | 'resume' | 'cancel') => {
    setActionLoading(true);
    try {
      await fetch('/api/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await fetchSubscription();
      setShowCancelConfirm(false);
    } catch (error) {
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveItem = async (productId: string) => {
    try {
      await fetch('/api/subscription/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: [productId] }),
      });
      await fetchSubscription();
    } catch (error) {
      console.error(error);
    }
  };

  const handlePortal = async () => {
    try {
      const res = await fetch('/api/subscription/portal', { method: 'POST' });
      const data = await res.json() as { url: string };
      if (data.url) window.location.href = data.url;
    } catch (error) {
      console.error(error);
    }
  };

  const orderStatusLabel: Record<string, string> = {
    pending: 'Preparing',
    processing: 'Processing',
    shipped: 'Shipped',
    delivered: 'Delivered',
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-body text-text-tertiary">Loading...</p>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="px-5 pt-6 pb-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-text-tertiary hover:text-text-primary">
            <Icon name="back" size="md" />
          </button>
          <h1 className="text-heading font-medium text-text-primary">Subscription</h1>
        </div>
        <Card variant="default" className="text-center py-12">
          <p className="text-body text-text-secondary">No active subscription.</p>
          <button
            onClick={() => router.push('/protocol')}
            className="mt-4 text-caption text-accent font-medium hover:underline"
          >
            View your protocol →
          </button>
        </Card>
      </div>
    );
  }

  const periodEnd = new Date(subscription.currentPeriodEnd);

  return (
    <div className="px-5 pt-6 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-text-tertiary hover:text-text-primary">
          <Icon name="back" size="md" />
        </button>
        <h1 className="text-heading font-medium text-text-primary">Subscription</h1>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Status card */}
        <Card variant="default">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>STATUS</SectionLabel>
            <SubscriptionStatusBadge status={subscription.status} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-caption">
              <span className="text-text-tertiary">Next billing</span>
              <span className="text-text-primary">{periodEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <div className="flex justify-between text-caption">
              <span className="text-text-tertiary">Monthly total</span>
              <span className="font-mono text-text-primary">£{(subscription.monthlyTotalCents / 100).toFixed(2)}</span>
            </div>
          </div>
          {subscription.cancelAtPeriodEnd && (
            <p className="mt-3 text-caption text-caution">
              Cancels at end of current period
            </p>
          )}
        </Card>

        {/* Compounds */}
        <section>
          <SectionLabel>YOUR COMPOUNDS</SectionLabel>
          <div className="mt-3">
            {subscription.items.map((item) => (
              <CompoundRow
                key={item.id}
                product={item.product}
                included
                isFromProtocol={item.isFromProtocol}
                onToggle={() => handleRemoveItem(item.product.id)}
              />
            ))}
          </div>
          <button
            onClick={() => router.push('/protocol/subscribe')}
            className="mt-3 text-caption text-accent font-medium hover:underline"
          >
            Add more compounds →
          </button>
        </section>

        {/* Actions */}
        <section>
          <SectionLabel>MANAGE</SectionLabel>
          <div className="mt-3 space-y-2">
            {subscription.status === 'active' && (
              <Button variant="secondary" fullWidth onClick={() => handleAction('pause')} disabled={actionLoading}>
                Pause subscription
              </Button>
            )}
            {subscription.status === 'paused' && (
              <Button fullWidth onClick={() => handleAction('resume')} disabled={actionLoading}>
                Resume subscription
              </Button>
            )}
            <Button variant="secondary" fullWidth onClick={handlePortal}>
              Billing &amp; payment
            </Button>
            {subscription.status !== 'canceled' && !subscription.cancelAtPeriodEnd && (
              <>
                {showCancelConfirm ? (
                  <Card variant="default" className="border-alert/20">
                    <p className="text-body text-text-primary mb-3">Are you sure? Your supplements will stop after the current period.</p>
                    <div className="flex gap-2">
                      <Button variant="secondary" fullWidth onClick={() => setShowCancelConfirm(false)}>
                        Keep subscription
                      </Button>
                      <button
                        onClick={() => handleAction('cancel')}
                        disabled={actionLoading}
                        className="flex-1 h-11 rounded-button text-caption font-medium text-alert border border-alert/30 hover:bg-alert/5 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </Card>
                ) : (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="w-full text-center py-3 text-caption text-alert hover:underline"
                  >
                    Cancel subscription
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Order history */}
        {subscription.orders.length > 0 && (
          <section>
            <SectionLabel>ORDER HISTORY</SectionLabel>
            <div className="mt-3 space-y-2">
              {subscription.orders.map((order) => {
                const isExpanded = expandedOrder === order.id;
                const statusColor: Record<string, string> = {
                  pending: 'text-text-tertiary',
                  processing: 'text-caution',
                  shipped: 'text-accent',
                  delivered: 'text-positive',
                };
                return (
                  <Card
                    key={order.id}
                    variant="default"
                    className="py-3 cursor-pointer hover:border-border-hover transition-colors"
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-caption text-text-primary">
                          {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`text-caption capitalize ${statusColor[order.status] ?? 'text-text-tertiary'}`}>
                        {orderStatusLabel[order.status] ?? order.status}
                      </span>
                    </div>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 pt-3 border-t border-border space-y-2"
                      >
                        <div className="flex justify-between text-caption">
                          <span className="text-text-tertiary">Status</span>
                          <span className={`font-medium capitalize ${statusColor[order.status] ?? ''}`}>
                            {orderStatusLabel[order.status] ?? order.status}
                          </span>
                        </div>
                        <div className="flex justify-between text-caption">
                          <span className="text-text-tertiary">Items</span>
                          <span className="text-text-primary">
                            {subscription.items.length} compound{subscription.items.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {order.trackingNumber && (
                          <div className="flex justify-between text-caption">
                            <span className="text-text-tertiary">Tracking</span>
                            <span className="font-mono text-accent">{order.trackingNumber}</span>
                          </div>
                        )}
                        {(order.status === 'pending' || order.status === 'processing') && (
                          <p className="text-caption text-text-tertiary italic">
                            Your order is being prepared and will ship soon.
                          </p>
                        )}
                        {order.status === 'shipped' && (
                          <p className="text-caption text-text-tertiary italic">
                            Your supplements are on the way.
                          </p>
                        )}
                        {order.status === 'delivered' && (
                          <p className="text-caption text-positive italic">
                            Delivered successfully.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </motion.div>
    </div>
  );
}
