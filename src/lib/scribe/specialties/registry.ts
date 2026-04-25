/**
 * Specialty registry — single source of truth for the specialty taxonomy.
 *
 * Adding a specialty is a one-file edit. Reviewers can read this file and
 * know the complete map of specialties the general scribe is aware of.
 *
 * Contracts:
 *   - `core` specialties have non-null systemPromptPath + safetyPolicyKey
 *     and can be referred to with a working specialist response.
 *   - `stub` specialties have null systemPromptPath + safetyPolicyKey and
 *     a non-empty referralFallbackMessage. Stub referrals are visible
 *     fallbacks, never silent dead ends.
 *
 * Existing topics (`iron`, `energy-fatigue`) are intentionally NOT specialties:
 *   - `iron` is a sub-topic under `cardiometabolic` (its safety policy lives
 *     on as `iron` in the topic-policy registry for back-compat with existing
 *     `iron` Scribe rows; new iron-related questions route to cardiometabolic).
 *   - `energy-fatigue` is a triage topic the general scribe owns directly
 *     (its safety policy stays in the topic-policy registry; the general
 *     scribe references it).
 */

import type { Specialty } from './types';

const SPECIALTIES: readonly Specialty[] = Object.freeze([
  {
    key: 'general',
    status: 'core',
    displayName: 'General care',
    scope:
      'Triage and coordination across all domains. Owns the chat by default; refers to specialists when depth helps.',
    systemPromptPath: 'src/lib/scribe/specialties/general/system-prompt.md',
    safetyPolicyKey: 'general',
  },
  {
    key: 'cardiometabolic',
    status: 'core',
    displayName: 'Cardiometabolic medicine',
    scope:
      'Heart, vascular, glucose, lipids, blood pressure, weight regulation, iron-deficiency anemia, metabolic syndrome.',
    systemPromptPath: 'src/lib/scribe/specialties/cardiometabolic/system-prompt.md',
    safetyPolicyKey: 'cardiometabolic',
  },
  {
    key: 'sleep-recovery',
    status: 'core',
    displayName: 'Sleep and recovery',
    scope:
      'Sleep architecture, HRV, fatigue patterns, recovery, the iron-fatigue link, circadian alignment.',
    systemPromptPath: 'src/lib/scribe/specialties/sleep-recovery/system-prompt.md',
    safetyPolicyKey: 'sleep-recovery',
  },
  {
    key: 'hormonal-endocrine',
    status: 'core',
    displayName: 'Hormonal and endocrine health',
    scope:
      'Thyroid, sex hormones, cortisol, adrenal patterns, metabolic hormone signaling.',
    systemPromptPath: 'src/lib/scribe/specialties/hormonal-endocrine/system-prompt.md',
    safetyPolicyKey: 'hormonal-endocrine',
  },
  {
    key: 'mental-health',
    status: 'stub',
    displayName: 'Mental health',
    scope: 'Mood, anxiety, cognition, stress patterns.',
    systemPromptPath: null,
    safetyPolicyKey: null,
    referralFallbackMessage:
      'Mental health specialist is not yet built — answering with general-scribe knowledge.',
  },
  {
    key: 'musculoskeletal',
    status: 'stub',
    displayName: 'Musculoskeletal',
    scope: 'Joints, muscles, posture, mobility, injury and pain patterns.',
    systemPromptPath: null,
    safetyPolicyKey: null,
    referralFallbackMessage:
      'Musculoskeletal specialist is not yet built — answering with general-scribe knowledge.',
  },
  {
    key: 'gi-digestive',
    status: 'stub',
    displayName: 'GI and digestive',
    scope: 'Gut, digestion, microbiome, IBS, food sensitivities, bloating patterns.',
    systemPromptPath: null,
    safetyPolicyKey: null,
    referralFallbackMessage:
      'GI specialist is not yet built — answering with general-scribe knowledge.',
  },
  {
    key: 'immune-inflammation',
    status: 'stub',
    displayName: 'Immune and inflammation',
    scope: 'CRP, allergies, autoimmune patterns, recurrent infection, inflammatory markers.',
    systemPromptPath: null,
    safetyPolicyKey: null,
    referralFallbackMessage:
      'Immune specialist is not yet built — answering with general-scribe knowledge.',
  },
  {
    key: 'reproductive',
    status: 'stub',
    displayName: 'Reproductive health',
    scope: 'Menstrual cycle, fertility, perimenopause, sexual health.',
    systemPromptPath: null,
    safetyPolicyKey: null,
    referralFallbackMessage:
      'Reproductive specialist is not yet built — answering with general-scribe knowledge.',
  },
  {
    key: 'neuro-cognitive',
    status: 'stub',
    displayName: 'Neurological and cognitive',
    scope: 'Cognition, memory, headache patterns, neurological symptoms.',
    systemPromptPath: null,
    safetyPolicyKey: null,
    referralFallbackMessage:
      'Neurological specialist is not yet built — answering with general-scribe knowledge.',
  },
  {
    key: 'dermatology',
    status: 'stub',
    displayName: 'Dermatology',
    scope: 'Skin, hair, nails. Acne, eczema, hair-loss patterns.',
    systemPromptPath: null,
    safetyPolicyKey: null,
    referralFallbackMessage:
      'Dermatology specialist is not yet built — answering with general-scribe knowledge.',
  },
  {
    key: 'nutrition',
    status: 'stub',
    displayName: 'Nutrition',
    scope: 'Macronutrients, micronutrient gaps, dietary patterns, food-mood links.',
    systemPromptPath: null,
    safetyPolicyKey: null,
    referralFallbackMessage:
      'Nutrition specialist is not yet built — answering with general-scribe knowledge.',
  },
  {
    key: 'preventive-care',
    status: 'stub',
    displayName: 'Preventive care',
    scope: 'Screening cadences, vaccinations, risk-stratification.',
    systemPromptPath: null,
    safetyPolicyKey: null,
    referralFallbackMessage:
      'Preventive care specialist is not yet built — answering with general-scribe knowledge.',
  },
]);

const BY_KEY: ReadonlyMap<string, Specialty> = new Map(SPECIALTIES.map((s) => [s.key, s]));

export function getSpecialty(key: string): Specialty | undefined {
  return BY_KEY.get(key);
}

export function listSpecialties(): readonly Specialty[] {
  return SPECIALTIES;
}

export function listCoreSpecialties(): readonly Specialty[] {
  return SPECIALTIES.filter((s) => s.status === 'core');
}

export function listStubSpecialties(): readonly Specialty[] {
  return SPECIALTIES.filter((s) => s.status === 'stub');
}

export function isCoreSpecialty(key: string): boolean {
  return BY_KEY.get(key)?.status === 'core';
}

export function isStubSpecialty(key: string): boolean {
  return BY_KEY.get(key)?.status === 'stub';
}

export function listCoreSpecialtyKeys(): string[] {
  return listCoreSpecialties().map((s) => s.key);
}
