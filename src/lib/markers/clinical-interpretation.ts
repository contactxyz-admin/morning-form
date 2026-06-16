/**
 * Clinical interpretation engine (plan 2026-06-16-003) — turns a marker's
 * already-derived change into the four consumer dimensions the CMO specified:
 * Where it is now · What changed (the node's `change`, not duplicated here) ·
 * How clear the signal is · What to do next, plus a flag tier.
 *
 * The per-marker copy is a CMO-AUTHORED DATA TABLE, verbatim. The language is
 * the regulatory intended-purpose surface (MHRA), so it lives here as
 * reviewable data, not free logic — the engine is a thin evaluator over it.
 * Status/clarity/flag may honestly disagree with raw movement (e.g. ferritin
 * rose but stays context-dependent — an acute-phase reactant). Pure; demo-only.
 *
 * Reference ranges below are MorningForm ATTENTION thresholds, never clinical
 * treatment thresholds.
 */

import type { FlagTier, NodeChangeWire, NodeInterpretation } from '@/types/graph';

interface Ctx {
  change: NodeChangeWire;
  value: number;
  low: number | null;
  high: number | null;
}

interface MarkerRule {
  /** Optional override; default is position-based (see `positionLabel`). */
  whereItIsNow?: (c: Ctx) => string;
  signalClarity: string;
  nextStep: string;
  plainEnglish: (c: Ctx) => string;
  flag: FlagTier | ((c: Ctx) => FlagTier);
}

/** Default "where it is now" from the latest value's position vs the range. */
function positionLabel(c: Ctx): string {
  if (c.change.classification === 'new') return 'New baseline captured';
  if (c.high != null && c.value > c.high) return 'Above attention threshold';
  if (c.low != null && c.value < c.low) return 'Below range';
  return 'Within range';
}

const aboveThreshold = (c: Ctx) => c.high != null && c.value > c.high;

// ── CMO-authored matrix (verbatim copy, 2026-06-16) ──
const MATRIX: Record<string, MarkerRule> = {
  ldl: {
    signalClarity: 'Medium–High',
    nextStep:
      'Review your full lipid profile and overall risk with a clinician; track diet, alcohol, training load, weight change and family history.',
    plainEnglish: (c) =>
      aboveThreshold(c)
        ? "Your LDL-C has increased since your last test and is above MorningForm’s attention threshold. This is not a diagnosis or treatment trigger, but worth reviewing alongside your full lipid profile and overall risk with a clinician."
        : 'Your LDL-C is within range.',
    flag: (c) => (aboveThreshold(c) ? 'clinician_discussion' : 'attention'),
  },
  apob: {
    whereItIsNow: () => 'New baseline captured',
    signalClarity: 'Medium',
    nextStep:
      'Use as a reference point for future retesting; review alongside LDL-C, non-HDL, triglycerides and family history.',
    plainEnglish: () =>
      'ApoB is newly captured in this baseline, so there’s no trend yet — it adds context to LDL-C by helping quantify the number of atherogenic particles.',
    flag: 'attention',
  },
  ferritin: {
    signalClarity: 'Context-dependent',
    nextStep:
      'Interpret with CRP/inflammation, full blood count, symptoms and clinician context.',
    plainEnglish: () =>
      'Ferritin can rise with inflammation as well as iron repletion, so it’s interpreted with iron studies and context rather than on its own.',
    flag: 'attention',
  },
  hba1c: {
    signalClarity: 'Needs context if iron status or red-cell markers are abnormal',
    nextStep: 'Interpret with glucose markers and iron/full blood count context.',
    plainEnglish: () =>
      'HbA1c is interpreted alongside glucose and iron markers, since iron status can affect the result.',
    flag: 'attention',
  },
};

// Conservative fallback for any marker without an authored rule — never a
// false-reassuring "favourable/normal".
const DEFAULT_RULE: MarkerRule = {
  signalClarity: 'Low',
  nextStep: 'Review this marker with a clinician for context.',
  plainEnglish: () => 'This marker needs clinician context to interpret.',
  flag: 'clinician_discussion',
};

/**
 * Interpret a marker's change into the four consumer dimensions + flag.
 * `latest` carries the most recent value + its reference range (the change
 * itself doesn't store the range). Unknown markers use the conservative default.
 */
export function interpret(
  canonicalKey: string,
  change: NodeChangeWire,
  latest: { value: number; low: number | null; high: number | null },
): NodeInterpretation {
  const rule = MATRIX[canonicalKey] ?? DEFAULT_RULE;
  const ctx: Ctx = { change, value: latest.value, low: latest.low, high: latest.high };
  return {
    whereItIsNow: rule.whereItIsNow ? rule.whereItIsNow(ctx) : positionLabel(ctx),
    signalClarity: rule.signalClarity,
    nextStep: rule.nextStep,
    flag: typeof rule.flag === 'function' ? rule.flag(ctx) : rule.flag,
    plainEnglish: rule.plainEnglish(ctx),
  };
}
