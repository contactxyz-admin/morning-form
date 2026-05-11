/**
 * Priority-marker engine — pure function over assessment + state profile,
 * outputs the user's top 3–5 priority biomarkers ranked by impact-on-symptom
 * for their archetype.
 *
 * Phase 2: archetype-to-marker content lives in `content/priority-markers/
 * {archetype}.ts` files. The engine imports each one explicitly so that a
 * missing or malformed content file breaks the build, not the runtime —
 * production cannot ship without all six archetypes present and Zod-valid.
 *
 * The archetype-inference logic (assessment answers → archetype key) is
 * unchanged from the previous-gen protocol engine. Only the output mapping
 * pivots from supplement protocols to data-acquisition guidance.
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

import type {
  ArchetypeKey,
  ArchetypePriorities,
} from '@/lib/priority-markers-schema';

import sustainedActivator from '../../content/priority-markers/sustained-activator';
import fragmentedSleeper from '../../content/priority-markers/fragmented-sleeper';
import sympatheticDominant from '../../content/priority-markers/sympathetic-dominant';
import flatLiner from '../../content/priority-markers/flat-liner';
import overStimulated from '../../content/priority-markers/over-stimulated';
import wellRegulated from '../../content/priority-markers/well-regulated';

export type Archetype = ArchetypeKey;

const ARCHETYPE_CONTENT: Record<Archetype, ArchetypePriorities> = {
  'sustained-activator': sustainedActivator,
  'fragmented-sleeper': fragmentedSleeper,
  'sympathetic-dominant': sympatheticDominant,
  'flat-liner': flatLiner,
  'over-stimulated': overStimulated,
  'well-regulated': wellRegulated,
};

/**
 * Infer archetype from assessment answers, then synthesize the state
 * profile a downstream consumer (reveal/profile, reveal/rationale)
 * renders against. Reuses the archetype-inference heuristics from the
 * deleted protocol-engine.ts verbatim — assessment + archetype taxonomy
 * are unchanged by the priority-markers pivot (D4 of plan).
 */
export function generateStateProfile(responses: AssessmentResponses): StateProfile {
  const archetype = inferArchetype(responses);
  const content = ARCHETYPE_CONTENT[archetype];
  return {
    archetype,
    primaryPattern: archetype.replace(/-/g, ' '),
    patternDescription: content.rationale,
    observations: inferObservations(responses),
    constraints: inferConstraints(responses),
    sensitivities: inferSensitivities(responses),
  };
}

/**
 * Build the priorities object for a user given their assessment responses.
 * Pure function; no side effects. Caller persists the return value via
 * Prisma. The output shape mirrors what the GET /api/assessment endpoint
 * returns to the client.
 */
export function buildPriorities(responses: AssessmentResponses): Omit<Priorities, 'id'> {
  const archetype = inferArchetype(responses);
  const content = ARCHETYPE_CONTENT[archetype];
  const items: Omit<PriorityMarker, 'id'>[] = content.markers.map((m) => ({
    markerName: m.markerName,
    rationale: m.rationale,
    category: m.category,
    panelAvailability: m.panelAvailability,
    sortOrder: m.sortOrder,
  }));
  return {
    version: 1,
    status: 'active',
    rationale: content.rationale,
    confidence: 'high',
    items: items.map((m) => ({ ...m, id: '' })),
  };
}

// ---------------------------------------------------------------------------
// Archetype + observation/constraint/sensitivity inference. Lifted verbatim
// from the deleted protocol-engine.ts so the assessment-to-archetype
// behaviour is unchanged across the pivot.
// ---------------------------------------------------------------------------

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
    constraints.push({
      label: 'Pregnancy flag — conservative recommendations',
      type: 'safety',
    });
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
