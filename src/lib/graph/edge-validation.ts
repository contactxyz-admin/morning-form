/**
 * Edge-endpoint rule table (T8).
 *
 * Some edge types carry semantic meaning only across certain node-type
 * pairs. `INSTANCE_OF` only makes sense from an `intervention_event` to
 * its parent intervention/medication/lifestyle; `OUTCOME_CHANGED` only
 * makes sense from an `intervention_event` to a measurable node
 * (biomarker/symptom/observation/metric_window). `SUPPORTS` is any → any
 * because provenance already filters to SourceDocument → graph-node at
 * the mutations layer.
 *
 * `null` on `validFromTypes` / `validToTypes` means "no restriction" —
 * any node type is permissible at that endpoint. This keeps the record
 * literal exhaustively keyed on `EdgeType` (compile-time check below)
 * without forcing us to enumerate every node type on the open cases.
 *
 * Writes through `addEdge` call `assertEdgeEndpoints` before persisting.
 * Reads are untouched — legacy rows from before this validator existed
 * remain readable and are only rejected on subsequent writes.
 */
import { EdgeEndpointViolation } from './errors';
import {
  type EdgeType,
  type NodeType,
  EDGE_TYPES,
  NODE_TYPES,
} from './types';

export interface EdgeEndpointRule {
  readonly validFromTypes: readonly NodeType[] | null;
  readonly validToTypes: readonly NodeType[] | null;
  /**
   * Optional per-from-type narrowing of the target list. When a fromType
   * appears here, its targets are checked against this list INSTEAD of
   * `validToTypes`. Added for INSTANCE_OF when `observation` → `biomarker`
   * joined (longitudinal plan 2026-06-10-002 U1): the flat from×to lists
   * would have newly permitted nonsense pairs the original table rejected
   * (e.g. intervention_event → biomarker), so the instance→parent relation
   * is expressed pairwise.
   */
  readonly validPairs?: Partial<Record<NodeType, readonly NodeType[]>>;
}

export const EDGE_ENDPOINT_RULES: Record<EdgeType, EdgeEndpointRule> = {
  SUPPORTS: { validFromTypes: null, validToTypes: null },
  ASSOCIATED_WITH: { validFromTypes: null, validToTypes: null },
  CAUSES: { validFromTypes: null, validToTypes: null },
  CONTRADICTS: { validFromTypes: null, validToTypes: null },
  TEMPORAL_SUCCEEDS: { validFromTypes: null, validToTypes: null },
  INSTANCE_OF: {
    validFromTypes: ['intervention_event', 'symptom_episode', 'observation'],
    validToTypes: ['intervention', 'medication', 'lifestyle', 'symptom', 'mood', 'energy', 'biomarker'],
    validPairs: {
      intervention_event: ['intervention', 'medication', 'lifestyle'],
      symptom_episode: ['symptom', 'mood', 'energy'],
      // A dated lab reading instance pointing at its marker concept node.
      observation: ['biomarker'],
    },
  },
  OUTCOME_CHANGED: {
    validFromTypes: ['intervention_event'],
    validToTypes: ['biomarker', 'symptom', 'observation', 'metric_window'],
  },
};

// Compile-time exhaustiveness: removing an EdgeType without updating the
// record above fails to type-check because the satisfies constraint forces
// every EdgeType key to be present.
const _EDGE_RULES_EXHAUSTIVE: Record<EdgeType, EdgeEndpointRule> = EDGE_ENDPOINT_RULES;
void _EDGE_RULES_EXHAUSTIVE;

// Runtime exhaustiveness: every EdgeType tuple entry has a rule. Also
// every NodeType referenced in a rule must still be a valid NodeType.
// Throws on module load in dev so registry drift is caught early.
for (const edgeType of EDGE_TYPES) {
  const rule = EDGE_ENDPOINT_RULES[edgeType];
  if (!rule) {
    throw new Error(`EDGE_ENDPOINT_RULES missing entry for ${edgeType}`);
  }
  const pairLists = rule.validPairs
    ? [Object.keys(rule.validPairs) as NodeType[], ...Object.values(rule.validPairs)]
    : [];
  for (const list of [rule.validFromTypes, rule.validToTypes, ...pairLists]) {
    if (list === null) continue;
    for (const t of list) {
      if (!(NODE_TYPES as readonly string[]).includes(t)) {
        throw new Error(`EDGE_ENDPOINT_RULES for ${edgeType} references unknown NodeType "${t}"`);
      }
    }
  }
}

/**
 * Validate an edge's endpoints against the rule table. Throws
 * `EdgeEndpointViolation` on mismatch; returns silently on pass.
 */
export function assertEdgeEndpoints(
  edgeType: EdgeType,
  fromType: NodeType,
  toType: NodeType,
): void {
  const rule = EDGE_ENDPOINT_RULES[edgeType];
  if (rule.validFromTypes && !rule.validFromTypes.includes(fromType)) {
    throw new EdgeEndpointViolation(edgeType, fromType, toType, 'invalid_from');
  }
  // Pairwise narrowing wins over the flat to-list when the fromType has an
  // entry — see the validPairs doc comment.
  const pairTargets = rule.validPairs?.[fromType];
  if (pairTargets) {
    if (!pairTargets.includes(toType)) {
      throw new EdgeEndpointViolation(edgeType, fromType, toType, 'invalid_to');
    }
    return;
  }
  if (rule.validToTypes && !rule.validToTypes.includes(toType)) {
    throw new EdgeEndpointViolation(edgeType, fromType, toType, 'invalid_to');
  }
}
