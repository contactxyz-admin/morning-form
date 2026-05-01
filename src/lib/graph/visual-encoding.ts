/**
 * Visual encoding for the graph canvas — single source of truth for how
 * each NodeType / EdgeType renders.
 *
 * The 18 NodeTypes collapse to 4 visual classes (clinical, biomarker,
 * intervention, data) so the canvas has 4 distinguishable colours rather
 * than 18 indistinguishable ones. The 7 EdgeTypes collapse to 3
 * hierarchy classes (agreement, causation, contradiction) for the same
 * reason — pre-attentive perception research caps reliable distinction
 * at 3-4 line styles before they read as noise.
 *
 * Full taxonomy is preserved in the data; tooltips on hover surface the
 * specific NodeType / EdgeType when a visitor wants the detail.
 */

import type { EdgeType, NodeType } from './types';
import type { ImportanceTier } from './importance';

export type NodeVisualClass = 'clinical' | 'biomarker' | 'intervention' | 'data';
export type EdgeHierarchy = 'agreement' | 'causation' | 'contradiction';

export interface NodeVisual {
  readonly visualClass: NodeVisualClass;
  /** Tailwind fill class for the node circle. */
  readonly fillClass: string;
  /** Tailwind stroke class for the node circle. */
  readonly strokeClass: string;
}

export interface EdgeVisual {
  readonly hierarchy: EdgeHierarchy;
  /** Tailwind stroke class for the edge line. */
  readonly strokeClass: string;
  /** Stroke width in SVG units. */
  readonly strokeWidth: number;
  /** SVG stroke-dasharray (or undefined for solid). */
  readonly dashArray?: string;
  /** Whether to render an arrow head (causation only). */
  readonly arrowHead: boolean;
}

/**
 * Map each NodeType to one of 4 visual classes. Buckets:
 * - clinical:     conditions, symptoms, allergies — the "what's wrong" layer
 * - biomarker:    measured values + observations + windows — the "what we know" layer
 * - intervention: treatments, lifestyle, encounters, referrals — the "what's being done" layer
 * - data:         sources, mood/energy self-reports — the "where it came from" layer
 */
const NODE_VISUAL_CLASS: Record<NodeType, NodeVisualClass> = {
  // clinical
  condition: 'clinical',
  symptom: 'clinical',
  symptom_episode: 'clinical',
  allergy: 'clinical',
  // biomarker
  biomarker: 'biomarker',
  observation: 'biomarker',
  metric_window: 'biomarker',
  // intervention
  intervention: 'intervention',
  intervention_event: 'intervention',
  medication: 'intervention',
  lifestyle: 'intervention',
  procedure: 'intervention',
  encounter: 'intervention',
  referral: 'intervention',
  immunisation: 'intervention',
  // data
  source_document: 'data',
  mood: 'data',
  energy: 'data',
};

const NODE_VISUAL_BY_CLASS: Record<NodeVisualClass, Pick<NodeVisual, 'fillClass' | 'strokeClass'>> = {
  clinical: { fillClass: 'fill-alert/15', strokeClass: 'stroke-alert/70' },
  biomarker: { fillClass: 'fill-accent/20', strokeClass: 'stroke-accent' },
  intervention: { fillClass: 'fill-positive/15', strokeClass: 'stroke-positive/80' },
  data: { fillClass: 'fill-text-tertiary/10', strokeClass: 'stroke-text-tertiary/60' },
};

export function visualForNode(type: NodeType): NodeVisual {
  const visualClass = NODE_VISUAL_CLASS[type] ?? 'data';
  return { visualClass, ...NODE_VISUAL_BY_CLASS[visualClass] };
}

/**
 * Tier-based radius. Tier 1 reads as a quiet headline, tier 3 as
 * metadata. Matches seam's neural-ink renderer.
 */
export function radiusForTier(tier: ImportanceTier): number {
  switch (tier) {
    case 1:
      return 12;
    case 2:
      return 9;
    case 3:
    default:
      return 7;
  }
}

/**
 * Whether a node's label is always visible. Tier 1 always-on; tier 2/3
 * surface only on hover/focus to prevent label collision at 32 nodes.
 */
export function labelVisibleByDefault(tier: ImportanceTier): boolean {
  return tier === 1;
}

/**
 * Map each EdgeType to one of 3 hierarchy classes. The full taxonomy is
 * preserved in the edge data — tooltips disclose the specific type on
 * hover. The visual treatment groups by intent.
 */
const EDGE_HIERARCHY: Record<EdgeType, EdgeHierarchy> = {
  SUPPORTS: 'agreement',
  ASSOCIATED_WITH: 'agreement',
  TEMPORAL_SUCCEEDS: 'agreement',
  INSTANCE_OF: 'agreement',
  OUTCOME_CHANGED: 'agreement',
  CAUSES: 'causation',
  CONTRADICTS: 'contradiction',
};

const EDGE_VISUAL_BY_HIERARCHY: Record<EdgeHierarchy, Omit<EdgeVisual, 'hierarchy'>> = {
  agreement: {
    strokeClass: 'stroke-text-tertiary/50',
    strokeWidth: 1,
    arrowHead: false,
  },
  causation: {
    strokeClass: 'stroke-text-secondary/70',
    strokeWidth: 1.4,
    arrowHead: true,
  },
  contradiction: {
    strokeClass: 'stroke-alert/60',
    strokeWidth: 1.4,
    dashArray: '4 3',
    arrowHead: false,
  },
};

export function visualForEdge(type: EdgeType): EdgeVisual {
  const hierarchy = EDGE_HIERARCHY[type] ?? 'agreement';
  return { hierarchy, ...EDGE_VISUAL_BY_HIERARCHY[hierarchy] };
}
