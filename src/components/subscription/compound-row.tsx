'use client';

import { cn } from '@/lib/utils';
import type { Product } from '@/types';

interface CompoundRowProps {
  product: Product;
  included: boolean;
  isFromProtocol?: boolean;
  onToggle: (productId: string) => void;
}

export function CompoundRow({ product, included, isFromProtocol, onToggle }: CompoundRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0 mr-3">
        <div className="flex items-center gap-2">
          <p className="text-body font-medium text-text-primary truncate">{product.name}</p>
          {isFromProtocol && (
            <span className="shrink-0 rounded-chip bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-accent">
              Protocol
            </span>
          )}
        </div>
        <p className="text-caption text-text-tertiary mt-0.5">{product.dosage}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono text-data text-text-secondary">
          £{(product.priceInCents / 100).toFixed(2)}
        </span>
        <button
          onClick={() => onToggle(product.id)}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center transition-all text-sm font-medium',
            included
              ? 'bg-accent text-white'
              : 'bg-surface border border-border text-text-tertiary hover:border-accent hover:text-accent'
          )}
        >
          {included ? '✓' : '+'}
        </button>
      </div>
    </div>
  );
}
