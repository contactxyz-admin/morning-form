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
 * Selection-halo stroke per visual class. Slightly stronger than the node's
 * own stroke so the halo reads as emphasis rather than duplication. Mirrored
 * in tailwind.config.ts safelist (src/lib classes are JIT-dropped otherwise).
 */
const SELECTION_STROKE_BY_CLASS: Record<NodeVisualClass, string> = {
  clinical: 'stroke-alert/80',
  biomarker: 'stroke-accent',
  intervention: 'stroke-positive/80',
  data: 'stroke-text-tertiary/70',
};

/**
 * Stroke class for the selection halo ring
 * (docs/plans/2026-06-09-001-feat-graph-node-selection-ux-plan.md): the
 * halo speaks the node's identity, so it carries the node's visual-class
 * hue. Keyboard focus overrides to graphite in globals.css.
 */
export function selectionStrokeClass(type: NodeType): string {
  const visualClass = NODE_VISUAL_CLASS[type] ?? 'data';
  return SELECTION_STROKE_BY_CLASS[visualClass];
}

/**
 * "What changed since the last panel" tone for a biomarker node
 * (Plan 2026-06-10-003 U2). Range-relative + descriptive: improved/worsened
 * are read relative to the reference interval, not as value-judgements.
 * Returns the pulse/static-ring stroke + the badge fill. Total over a plain
 * string (defaults to the neutral tone) so it can't throw on an unexpected
 * classification — mirrors the `?? 'data'` fallback above.
 *
 * MUST stay mirrored in the tailwind.config.ts safelist — these classes are
 * referenced from src/lib and are JIT-dropped otherwise (the documented
 * content-glob trap).
 */
export interface ChangeVisual {
  readonly ringClass: string;
  readonly badgeFillClass: string;
}

const CHANGE_VISUAL_NEUTRAL: ChangeVisual = {
  ringClass: 'stroke-text-tertiary/70',
  badgeFillClass: 'fill-text-tertiary',
};

const CHANGE_VISUAL_BY_CLASSIFICATION: Record<string, ChangeVisual> = {
  improved: { ringClass: 'stroke-positive', badgeFillClass: 'fill-positive' },
  worsened: { ringClass: 'stroke-alert', badgeFillClass: 'fill-alert' },
  new: { ringClass: 'stroke-accent', badgeFillClass: 'fill-accent' },
  stable: CHANGE_VISUAL_NEUTRAL,
  unclassified: CHANGE_VISUAL_NEUTRAL,
};

export function changeVisual(classification: string): ChangeVisual {
  return CHANGE_VISUAL_BY_CLASSIFICATION[classification] ?? CHANGE_VISUAL_NEUTRAL;
}

/**
 * Halo ring radius — node radius + 4, matching the forceCollide padding in
 * use-graph-state.ts so a halo can never overlap a neighbouring dot.
 */
export function haloRadiusForTier(tier: ImportanceTier): number {
  return radiusForTier(tier) + 4;
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
