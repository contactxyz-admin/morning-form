/**
 * Priority-marker engine — pure function over assessment + state profile,
 * outputs the user's top 3–5 priority biomarkers ranked by impact-on-symptom
 * for their archetype.
 *
 * Replaces the previous-gen `protocol-engine.ts` that output supplement
 * stacks. Same architectural pattern (archetype-keyed BASE_PRIORITIES table,
 * `buildPriorities(responses)` entrypoint, archetype + observation/constraint/
 * sensitivity inference from raw assessment answers); fundamentally different
 * output (data-acquisition guidance, not intervention guidance).
 *
 * **Phase 1 ships placeholder content** — every priority marker reads
 * `[ARCHETYPE NAME] — placeholder marker N. Awaiting clinical review.`. The
 * editorial-QA gate at src/lib/compliance/static-copy.test.ts will catch any
 * forbidden-phrase drift; the production deploy gate (Phase 3) requires the
 * placeholders to be replaced with clinical-reviewer-approved markers (U3 of
 * docs/plans/2026-05-10-001-feat-priority-markers-pivot-plan.md).
 *
 * Marker names in the placeholder content are real biomarkers (Ferritin,
 * Vitamin D, etc.) so the type-checker and editorial-QA both get exercised
 * end-to-end before clinical content lands. Rationale strings are deliberately
 * vague ("placeholder — awaiting clinical review") so no one ships them.
 */
import type {
  AssessmentResponses,
  Constraint,
  Observation,
  PriorityMarker,
  Priorities,
  Sensitivity,
  StateProfile,
} from '@/types';

export type Archetype =
  | 'sustained-activator'
  | 'fragmented-sleeper'
  | 'sympathetic-dominant'
  | 'flat-liner'
  | 'over-stimulated'
  | 'well-regulated';

interface BasePriorities {
  items: Omit<PriorityMarker, 'id'>[];
  rationale: string;
}

/**
 * Placeholder priority sets per archetype. Real content lands in U3 via
 * content/priority-markers/{archetype}.ts files (TS data files, mirrors the
 * marketing-pages content pattern); this engine re-exports based on the
 * inferred archetype.
 *
 * **DO NOT SHIP THIS PLACEHOLDER CONTENT TO PRODUCTION.** The Phase 3 deploy
 * gate explicitly checks for "[placeholder]" / "Awaiting clinical review"
 * substrings; CI fails if found.
 */
const BASE_PRIORITIES: Record<Archetype, BasePriorities> = {
  'sustained-activator': {
    rationale:
      'Placeholder rationale for sustained-activator archetype. Awaiting clinical review.',
    items: [
      placeholderMarker('Ferritin', 'iron', 'both', 0),
      placeholderMarker('Free testosterone', 'hormones', 'both', 1),
      placeholderMarker('hs-CRP', 'inflammation', 'both', 2),
      placeholderMarker('Vitamin D (25-OH)', 'micronutrients', 'both', 3),
    ],
  },
  'fragmented-sleeper': {
    rationale:
      'Placeholder rationale for fragmented-sleeper archetype. Awaiting clinical review.',
    items: [
      placeholderMarker('Ferritin', 'iron', 'both', 0),
      placeholderMarker('TSH', 'thyroid', 'both', 1),
      placeholderMarker('Free T4', 'thyroid', 'both', 2),
      placeholderMarker('Magnesium', 'micronutrients', 'both', 3),
    ],
  },
  'sympathetic-dominant': {
    rationale:
      'Placeholder rationale for sympathetic-dominant archetype. Awaiting clinical review.',
    items: [
      placeholderMarker('hs-CRP', 'inflammation', 'both', 0),
      placeholderMarker('HbA1c', 'metabolic', 'both', 1),
      placeholderMarker('Free testosterone', 'hormones', 'both', 2),
      placeholderMarker('SHBG', 'hormones', 'both', 3),
    ],
  },
  'flat-liner': {
    rationale:
      'Placeholder rationale for flat-liner archetype. Awaiting clinical review.',
    items: [
      placeholderMarker('Ferritin', 'iron', 'both', 0),
      placeholderMarker('Vitamin D (25-OH)', 'micronutrients', 'both', 1),
      placeholderMarker('Total testosterone', 'hormones', 'both', 2),
      placeholderMarker('TSH', 'thyroid', 'both', 3),
    ],
  },
  'over-stimulated': {
    rationale:
      'Placeholder rationale for over-stimulated archetype. Awaiting clinical review.',
    items: [
      placeholderMarker('hs-CRP', 'inflammation', 'both', 0),
      placeholderMarker('HbA1c', 'metabolic', 'both', 1),
      placeholderMarker('Magnesium', 'micronutrients', 'both', 2),
    ],
  },
  'well-regulated': {
    rationale:
      'Placeholder rationale for well-regulated archetype. Awaiting clinical review.',
    items: [
      placeholderMarker('ApoB', 'cardio', 'both', 0),
      placeholderMarker('HbA1c', 'metabolic', 'both', 1),
      placeholderMarker('Vitamin D (25-OH)', 'micronutrients', 'both', 2),
      placeholderMarker('Ferritin', 'iron', 'both', 3),
    ],
  },
};

function placeholderMarker(
  markerName: string,
  category: string,
  panelAvailability: PriorityMarker['panelAvailability'],
  sortOrder: number,
): Omit<PriorityMarker, 'id'> {
  return {
    markerName,
    rationale: `Placeholder rationale for ${markerName}. Awaiting clinical review.`,
    category,
    panelAvailability,
    sortOrder,
  };
}

/**
 * Infer archetype from assessment answers. Heuristics ported from
 * `protocol-engine.ts` (now deleted) — the assessment system + archetype
 * taxonomy do not change in this pivot, only the output mapping does.
 */
export function generateStateProfile(responses: AssessmentResponses): StateProfile {
  const archetype = inferArchetype(responses);
  return {
    archetype,
    primaryPattern: archetype.replace(/-/g, ' '),
    patternDescription: BASE_PRIORITIES[archetype].rationale,
    observations: inferObservations(responses),
    constraints: inferConstraints(responses),
    sensitivities: inferSensitivities(responses),
  };
}

/**
 * Build the priorities object for a user given their assessment responses.
 * Pure function; no side effects. Caller persists the return value via Prisma.
 */
export function buildPriorities(responses: AssessmentResponses): Omit<Priorities, 'id'> {
  const archetype = inferArchetype(responses);
  const base = BASE_PRIORITIES[archetype];
  return {
    version: 1,
    status: 'active',
    rationale: base.rationale,
    confidence: 'high',
    items: base.items.map((m) => ({ ...m, id: '' })),
  };
}

// ---------------------------------------------------------------------------
// Archetype + observation/constraint/sensitivity inference. Lifted-and-
// shifted from the deleted protocol-engine.ts so the assessment-to-archetype
// behaviour is unchanged. If any of these heuristics felt principled enough
// to test, that test is the right place to validate the pivot didn't change
// behaviour. (None had tests in the previous codebase.)
// ---------------------------------------------------------------------------

// Lifted verbatim from the deleted protocol-engine.ts. Brainstorm D4 locked
// the assessment + archetype taxonomy as unchanged — only the output mapping
// pivots from supplements to priority markers.
function inferArchetype(responses: AssessmentResponses): Archetype {
  const stim = responses.stimulant_sensitivity as string;
  const stress = responses.stress_level as number;
  const anxiety = responses.anxiety_frequency as string;
  const windDown = responses.wind_down_ability as number;
  const sleepQuality = responses.sleep_quality as number;
  const morningEnergy = responses.morning_energy as number;
  const afternoonEnergy = responses.afternoon_energy as number;
  const nightWaking = responses.night_waking as string;
  const goal = responses.primary_goal as string;

  if ((stim === 'high' || anxiety === 'daily' || anxiety === 'often') && stress >= 4) {
    return 'over-stimulated';
  }
  if (stress >= 4 && windDown <= 2) {
    return 'sympathetic-dominant';
  }
  if ((nightWaking === '3_plus' || nightWaking === 'variable') && morningEnergy <= 2 && afternoonEnergy >= 3) {
    return 'fragmented-sleeper';
  }
  if (morningEnergy <= 2 && afternoonEnergy <= 2) {
    return 'flat-liner';
  }
  if ((goal === 'focus' || goal === 'sleep') && afternoonEnergy >= 3 && windDown <= 3) {
    return 'sustained-activator';
  }
  if (sleepQuality >= 4 && stress <= 2 && morningEnergy >= 3) {
    return 'well-regulated';
  }
  return 'sustained-activator';
}

function inferObservations(responses: AssessmentResponses): Observation[] {
  // Keep the observation-emission shape from the deleted engine — these
  // surface on /reveal/profile via stateProfile.observations.
  const observations: Observation[] = [];
  if (typeof responses.afternoon_energy === 'number') {
    observations.push({
      label: 'Afternoon energy',
      detail: `Self-reported ${responses.afternoon_energy}/5`,
    });
  }
  if (typeof responses.sleep_quality === 'number') {
    observations.push({
      label: 'Sleep quality',
      detail: `Self-reported ${responses.sleep_quality}/5`,
    });
  }
  if (responses.stimulant_sensitivity) {
    observations.push({
      label: 'Stimulant sensitivity',
      detail: String(responses.stimulant_sensitivity),
    });
  }
  return observations;
}

function inferConstraints(responses: AssessmentResponses): Constraint[] {
  const constraints: Constraint[] = [];
  if (responses.pregnancy === 'yes' || responses.pregnancy === 'prefer_not') {
    constraints.push({ label: 'Pregnancy flag — conservative recommendations', type: 'safety' });
  }
  return constraints;
}

function inferSensitivities(responses: AssessmentResponses): Sensitivity[] {
  const sensitivities: Sensitivity[] = [];
  const stim = responses.stimulant_sensitivity;
  if (stim === 'high') {
    sensitivities.push({ label: 'Stimulant sensitivity', level: 'high' });
  } else if (stim === 'moderate' || stim === 'low') {
    sensitivities.push({
      label: 'Stimulant sensitivity',
      level: stim === 'moderate' ? 'moderate-high' : 'moderate',
    });
  }
  return sensitivities;
}
