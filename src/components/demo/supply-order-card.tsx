'use client';

/**
 * Supply reorder card for `/demo/ask` (plan 2026-06-10-001 U3).
 *
 * The purchase is user-initiated by construction — the sequence's chip
 * text is the user asking for the reorder, and this card only confirms
 * that request (R-D). The preview tag is the honesty label (R-E):
 * Supply has not launched.
 */

import { Button } from '@/components/ui/button';
import { DEMO_SUPPLY_PRICE } from '@/lib/marketing/constants';
import {
  DEMO_SUPPLY_PRODUCT,
  SUPPLY_ORDER_REFERENCE,
} from '@/lib/demo/ask-sequences';

interface Props {
  ordered: boolean;
  onConfirm: () => void;
}

export function SupplyOrderCard({ ordered, onConfirm }: Props) {
  return (
    <div className="max-w-[85%] w-full rounded-card border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
          {DEMO_SUPPLY_PRODUCT.previewTag}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
          {DEMO_SUPPLY_PRICE.display} / {DEMO_SUPPLY_PRICE.period}
        </p>
      </div>

      <p className="mt-3 text-body font-medium text-text-primary">
        {DEMO_SUPPLY_PRODUCT.name}
      </p>
      <p className="mt-0.5 text-caption text-text-secondary leading-relaxed">
        {DEMO_SUPPLY_PRODUCT.descriptor}
      </p>

      {ordered ? (
        <div className="mt-4 rounded-card border border-border bg-surface-warm px-3.5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
            Order placed · {SUPPLY_ORDER_REFERENCE}
          </p>
          <p className="mt-1 text-caption text-text-secondary">
            Monthly cycle — manage it any time from Settings.
          </p>
        </div>
      ) : (
        <Button size="sm" className="mt-4" onClick={onConfirm}>
          Confirm reorder
        </Button>
      )}
    </div>
  );
}
