/**
 * Action lifecycle transition matrix (Plan 2026-06-06-002 Phase B U2).
 *
 * Defines the valid state transitions and their timestamp side-effects.
 * This is the safety-bearing logic — every transition endpoint routes
 * through this matrix; the DB conditional updateMany is the enforce step,
 * this matrix is the "should we even attempt it" check.
 *
 * Valid transitions:
 *   suggested → accepted, dismissed
 *   accepted  → completed, dismissed
 *   completed → outcome-measured (measure-verb only; non-measure = terminal here)
 *   dismissed, outcome-measured → terminal (no transitions out)
 */

export const ACTION_STATES = [
  'suggested',
  'accepted',
  'completed',
  'outcome-measured',
  'dismissed',
] as const;

export type ActionState = (typeof ACTION_STATES)[number];

/** Verb set allowed to reach outcome-measured. */
const MEASURE_VERB = 'measure';

export interface Transition {
  /** The state the Action must currently be in. */
  from: ActionState;
  /** The target state. */
  to: ActionState;
  /** Timestamp field set on transition (null when no timestamp is touched). */
  timestampField: 'acceptedAt' | 'completedAt' | 'dismissedAt' | null;
  /** Verb constraint — if set, only actions with this verb can make this transition. */
  requiredVerb?: string;
  /** Whether this transition marks a terminal state. */
  terminal: boolean;
}

/**
 * Static transition table. Every valid edge is listed exactly once.
 * Tests exhaustively check: all from/to pairs NOT in this list must
 * be rejected.
 */
const TRANSITIONS: readonly Transition[] = [
  { from: 'suggested', to: 'accepted', timestampField: 'acceptedAt', terminal: false },
  { from: 'suggested', to: 'dismissed', timestampField: 'dismissedAt', terminal: true },
  { from: 'accepted', to: 'completed', timestampField: 'completedAt', terminal: false },
  { from: 'accepted', to: 'dismissed', timestampField: 'dismissedAt', terminal: true },
  { from: 'completed', to: 'outcome-measured', timestampField: null, requiredVerb: MEASURE_VERB, terminal: true },
];

const KEYED = new Map<string, Transition>();
for (const t of TRANSITIONS) {
  KEYED.set(`${t.from}→${t.to}`, t);
}

/**
 * Resolve the transition metadata for a `from → to` pair. Returns
 * `null` when the transition is invalid, including when the verb
 * constraint isn't met.
 */
export function resolveTransition(
  from: ActionState | string,
  to: ActionState | string,
  verb?: string,
): Transition | null {
  const t = KEYED.get(`${from}→${to}`);
  if (!t) return null;
  if (t.requiredVerb && verb !== t.requiredVerb) return null;
  return t;
}

/** Human-readable transition labels for API error messages. */
export function transitionLabel(from: ActionState, to: ActionState): string {
  return `${from} → ${to}`;
}

/** States that can be reached FROM a given state. */
export function allowedTransitions(from: ActionState, verb?: string): ActionState[] {
  return TRANSITIONS
    .filter((t) => t.from === from && (!t.requiredVerb || verb === t.requiredVerb))
    .map((t) => t.to);
}
