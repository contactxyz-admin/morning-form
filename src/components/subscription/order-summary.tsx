'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface OrderSummaryProps {
  itemCount: number;
  totalCents: number;
  onContinue: () => void;
  loading?: boolean;
}

export function OrderSummary({ itemCount, totalCents, onContinue, loading }: OrderSummaryProps) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-16 left-0 right-0 bg-bg border-t border-border px-5 py-4 pb-6"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-body text-text-secondary">
          {itemCount} compound{itemCount !== 1 ? 's' : ''} · monthly
        </span>
        <span className="font-mono text-subheading font-medium text-text-primary">
          £{(totalCents / 100).toFixed(2)}/mo
        </span>
      </div>
      <Button fullWidth onClick={onContinue} disabled={loading || itemCount === 0}>
        {loading ? 'Processing...' : 'Continue to payment'}
      </Button>
    </motion.div>
  );
}
