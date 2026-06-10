'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { cn } from '@/lib/utils';
import type { GraphNodeWire, NodeChangeWire, NodeType, ImportanceTier } from '@/types/graph';

/**
 * Mobile/default list view for the Health Graph.
 *
 * Groups nodes by type, orders groups by total weight (tier-1 dense types
 * float up), and within each group sorts by importance score descending.
 * Tier controls visual weight — tier-1 nodes read as quiet headlines,
 * tier-3 as metadata whispers.
 */

interface Props {
  nodes: GraphNodeWire[];
  onNodeClick?: (node: GraphNodeWire) => void;
}

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  biomarker: 'Biomarkers',
  symptom: 'Symptoms',
  symptom_episode: 'Symptom episodes',
  condition: 'Conditions',
  medication: 'Medications',
  intervention: 'Interventions',
  intervention_event: 'Intervention events',
  lifestyle: 'Lifestyle',
  metric_window: 'Metrics',
  observation: 'Observations',
  mood: 'Mood',
  energy: 'Energy',
  allergy: 'Allergies',
  immunisation: 'Immunisations',
  encounter: 'Encounters',
  referral: 'Referrals',
  procedure: 'Procedures',
  source_document: 'Sources',
};

const NODE_TYPE_ORDER: NodeType[] = [
  'biomarker',
  'symptom',
  'symptom_episode',
  'condition',
  'allergy',
  'immunisation',
  'medication',
  'intervention',
  'intervention_event',
  'procedure',
  'encounter',
  'referral',
  'observation',
  'metric_window',
  'lifestyle',
  'mood',
  'energy',
  'source_document',
];

function tierStyles(tier: ImportanceTier): string {
  switch (tier) {
    case 1:
      return 'text-text-primary text-heading font-display font-normal -tracking-[0.02em]';
    case 2:
      return 'text-text-primary text-subheading';
    case 3:
    default:
      return 'text-text-secondary text-body';
  }
}

export function GraphListView({ nodes, onNodeClick }: Props) {
  const groups = useMemo(() => {
    const bucket = new Map<NodeType, GraphNodeWire[]>();
    for (const n of nodes) {
      const arr = bucket.get(n.type) ?? [];
      arr.push(n);
      bucket.set(n.type, arr);
    }
    bucket.forEach((arr: GraphNodeWire[]) => {
      arr.sort((a, b) => b.score - a.score);
    });
    return NODE_TYPE_ORDER.map((type) => ({ type, items: bucket.get(type) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [nodes]);

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.type}>
          <div className="flex items-baseline justify-between mb-4">
            <SectionLabel>{NODE_TYPE_LABELS[group.type]}</SectionLabel>
            <span className="font-mono text-label text-text-tertiary">
              {String(group.items.length).padStart(2, '0')}
            </span>
          </div>
          <ul className="space-y-2">
            {group.items.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={onNodeClick ? () => onNodeClick(node) : undefined}
                  className={cn(
                    'w-full text-left',
                    'rounded-card border border-border bg-surface',
                    'px-5 py-4',
                    'transition-[transform,border-color,background-color,box-shadow] duration-450 ease-spring',
                    onNodeClick && 'hover:border-border-strong hover:shadow-card-hover active:scale-[0.997] active:duration-150',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button-focus',
                  )}
                  aria-label={`${node.displayName} — tier ${node.tier}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={cn('block truncate', tierStyles(node.tier))}>
                      {node.displayName}
                    </span>
                    <TierDot tier={node.tier} />
                  </div>
                  {node.change && <ChangeChip change={node.change} />}
                  {node.promoted && (
                    <span className="mt-1 inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-accent/70">
                      Promoted
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Static "what changed since last panel" chip — mobile parity for the canvas
// badge (Plan 2026-06-10-003 U4). Range-relative + descriptive, no motion.
const CHANGE_CHIP_TONE: Record<string, string> = {
  improved: 'text-positive',
  worsened: 'text-alert',
  new: 'text-accent',
  stable: 'text-text-tertiary',
  unclassified: 'text-text-tertiary',
};

function ChangeChip({ change }: { change: NodeChangeWire }) {
  const arrow =
    change.direction === 'up' ? '↑' : change.direction === 'down' ? '↓' : change.direction === 'flat' ? '→' : '';
  const tone = CHANGE_CHIP_TONE[change.classification] ?? 'text-text-tertiary';
  return (
    <span className={cn('mt-1 inline-block font-mono text-[10px] uppercase tracking-[0.08em]', tone)}>
      {change.beforeValue != null ? `${change.beforeValue} ${arrow} ${change.afterValue}` : `${arrow} ${change.afterValue}`}
      {change.unit ? ` ${change.unit}` : ''}
    </span>
  );
}

function TierDot({ tier }: { tier: ImportanceTier }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block shrink-0 rounded-full',
        tier === 1 && 'h-2.5 w-2.5 bg-accent',
        tier === 2 && 'h-2 w-2 bg-accent/50',
        tier === 3 && 'h-1.5 w-1.5 bg-text-tertiary/50',
      )}
    />
  );
}

export function GraphListEmpty() {
  return (
    <Card variant="paper" className="text-center py-12">
      <p className="font-display font-light text-heading text-text-primary -tracking-[0.02em]">
        Your record is quiet for now.
      </p>
      <p className="mt-3 text-body text-text-secondary max-w-sm mx-auto leading-relaxed">
        Add lab results, notes, or a check-in and the graph will fill in
        around them — one node at a time.
      </p>
    </Card>
  );
}
