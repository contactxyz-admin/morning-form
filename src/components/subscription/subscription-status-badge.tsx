import { cn } from '@/lib/utils';

interface SubscriptionStatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-positive-light text-positive' },
  paused: { label: 'Paused', className: 'bg-caution/10 text-caution' },
  canceled: { label: 'Cancelled', className: 'bg-alert/10 text-alert' },
  past_due: { label: 'Past due', className: 'bg-alert/10 text-alert' },
  trialing: { label: 'Trial', className: 'bg-accent/10 text-accent' },
};

export function SubscriptionStatusBadge({ status }: SubscriptionStatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, className: 'bg-surface text-text-tertiary' };

  return (
    <span className={cn('rounded-chip px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] font-medium', config.className)}>
      {config.label}
    </span>
  );
}
