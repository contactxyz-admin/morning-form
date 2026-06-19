/**
 * Source-abnormality signal (plan 2026-06-18-002) — relays a SOURCE's OWN
 * out-of-range flag, faithfully and source-attributed, never as a MorningForm
 * clinical judgement.
 *
 * The CMO model separates four signals (data availability · source abnormality ·
 * reviewed interpretation · escalation). This module owns the second: when a lab
 * (or other source) marks a value out of range — the structured `flaggedOutOfRange`
 * the lab extraction sets, "true only when the lab marks it out of range … do not
 * escalate" — we surface that as the safety net so a clearly-abnormal value is
 * never shown as silently neutral. We never INFER abnormality the source didn't
 * state; direction is read from the source's own value vs its printed range.
 *
 * Pure + surface-neutral: the demo adapter and the authed source route both
 * derive identically, and both detail surfaces render the same copy.
 */

import type { SourceAbnormality } from '@/types/graph';

/**
 * Build the source-abnormality signal from the source's own out-of-range flag.
 * `flagged` is the source's boolean; `value`/`low`/`high` are the source's own
 * numbers, used only to read the direction (above/below) — never to decide
 * abnormality (that's the source's call). Returns undefined when the source did
 * not flag the value, so nothing is fabricated.
 */
export function deriveSourceAbnormality(
  flagged: boolean,
  value: number | null,
  low: number | null,
  high: number | null,
): SourceAbnormality | undefined {
  if (!flagged) return undefined;
  let position: SourceAbnormality['position'] = 'out_of_range';
  if (value != null) {
    if (high != null && value > high) position = 'above';
    else if (low != null && value < low) position = 'below';
  }
  return { flaggedOutOfRange: true, position };
}

/**
 * Calm, source-attributed copy — passive voice signals it's the source's flag
 * being relayed, not our conclusion. Kept non-alarming (no "critical"/"urgent");
 * exact wording is a clinical sign-off gate.
 */
export const SOURCE_ABNORMALITY_LABEL: Record<SourceAbnormality['position'], string> = {
  above: 'Flagged above range',
  below: 'Flagged below range',
  out_of_range: 'Flagged out of range',
};
