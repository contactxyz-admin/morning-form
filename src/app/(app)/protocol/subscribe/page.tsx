'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { CompoundRow } from '@/components/subscription/compound-row';
import { OrderSummary } from '@/components/subscription/order-summary';
import type { Product, ProductWithCompounds } from '@/types';

interface ProtocolProductsResponse {
  archetype: string;
  pack: ProductWithCompounds | null;
  addOns: Product[];
}

export default function SubscribePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [archetype, setArchetype] = useState('');
  const [packCompounds, setPackCompounds] = useState<Product[]>([]);
  const [addOns, setAddOns] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/products/protocol')
      .then((res) => res.json())
      .then((data: ProtocolProductsResponse) => {
        setArchetype(data.archetype);
        const compounds = data.pack?.packCompounds.map((pc) => pc.compound) ?? [];
        setPackCompounds(compounds);
        setAddOns(data.addOns);
        setSelectedIds(new Set(compounds.map((c) => c.id)));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleCompound = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allProducts = [...packCompounds, ...addOns];
  const selectedProducts = allProducts.filter((p) => selectedIds.has(p.id));
  const totalCents = selectedProducts.reduce((sum, p) => sum + p.priceInCents, 0);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: Array.from(selectedIds) }),
      });
      const data = await res.json() as { url: string };
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout failed:', error);
      setCheckoutLoading(false);
    }
  };

  const archetypeLabel = archetype.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-body text-text-tertiary">Loading your protocol...</p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-40">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-text-tertiary hover:text-text-primary">
          <Icon name="back" size="md" />
        </button>
        <h1 className="text-heading font-medium text-text-primary">Your supplements</h1>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card variant="contextual" className="mb-6">
          <p className="text-caption text-text-secondary">
            <span className="font-medium text-accent">{archetypeLabel}</span> — your recommended protocol pack. Remove what you don&apos;t want, add from our full range below.
          </p>
        </Card>

        {/* Protocol compounds */}
        <section className="mb-8">
          <SectionLabel>YOUR PROTOCOL</SectionLabel>
          <div className="mt-3">
            {packCompounds.map((product) => (
              <CompoundRow
                key={product.id}
                product={product}
                included={selectedIds.has(product.id)}
                isFromProtocol
                onToggle={toggleCompound}
              />
            ))}
          </div>
        </section>

        {/* Add-on compounds */}
        {addOns.length > 0 && (
          <section>
            <SectionLabel>ADD TO YOUR PROTOCOL</SectionLabel>
            <p className="mt-1 text-caption text-text-tertiary mb-3">
              Compounds from other archetypes you can add to your stack.
            </p>
            <div>
              {addOns.map((product) => (
                <CompoundRow
                  key={product.id}
                  product={product}
                  included={selectedIds.has(product.id)}
                  onToggle={toggleCompound}
                />
              ))}
            </div>
          </section>
        )}
      </motion.div>

      <OrderSummary
        itemCount={selectedIds.size}
        totalCents={totalCents}
        onContinue={handleCheckout}
        loading={checkoutLoading}
      />
    </div>
  );
}
