/**
 * Marker-name ↔ wearable-metric alias map (longitudinal plan
 * 2026-06-10-002 U3).
 *
 * Lab biomarkers and wearable `HealthDataPoint`s are disjoint stores joined
 * only by name. They rarely share a literal name: a lab marker is
 * `"Ferritin"` / `ferritin`, while the same series synced from a device or
 * seeded by the demo persona is `ferritin_ng_ml`. The exact-name join in
 * the trajectory reader therefore silently fails to merge them.
 *
 * This is an EXPLICIT, registry-anchored map — deliberately not fuzzy
 * matching. A wrong join (co-plotting two different physiological
 * quantities) is worse than a missing one, so only hand-verified
 * equivalences live here. Unit compatibility is still enforced downstream by
 * `reconcileUnits` (drop-on-conflict), so an alias that turns out to carry an
 * incompatible unit is dropped rather than mis-plotted.
 */

/**
 * Keyed by a normalized marker token (lowercased; the lab displayName or
 * canonicalKey both normalize into this), → the set of `HealthDataPoint.metric`
 * strings that are the SAME physiological quantity. Values are matched
 * case-insensitively against the metric column.
 */
const METRIC_ALIASES: Record<string, readonly string[]> = {
  ferritin: ['ferritin_ng_ml'],
  hba1c: ['hba1c_percent', 'hba1c_mmol_mol'],
  'fasting glucose': ['fasting_glucose_mmol_l'],
  glucose_fasting: ['fasting_glucose_mmol_l'],
  'total cholesterol': ['total_cholesterol_mmol_l'],
  total_cholesterol: ['total_cholesterol_mmol_l'],
  'ldl cholesterol': ['ldl_mmol_l'],
  ldl_cholesterol: ['ldl_mmol_l'],
  'hdl cholesterol': ['hdl_mmol_l'],
  hdl_cholesterol: ['hdl_mmol_l'],
  triglycerides: ['triglycerides_mmol_l'],
  tsh: ['tsh_miu_l'],
  'free testosterone': ['free_testosterone_pg_ml'],
  hscrp: ['hscrp_mg_l'],
  hs_crp: ['hscrp_mg_l'],
  crp: ['hscrp_mg_l'],
  'body weight': ['weight_kg'],
  weight: ['weight_kg'],
  'systolic bp': ['systolic_bp_mmhg_morning'],
  systolic_bp: ['systolic_bp_mmhg_morning'],
  'diastolic bp': ['diastolic_bp_mmhg_morning'],
  diastolic_bp: ['diastolic_bp_mmhg_morning'],
  hrv: ['hrv_ms'],
};

function normalizeMarkerToken(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * All `HealthDataPoint.metric` strings that should be treated as the given
 * marker, INCLUDING the marker name itself (so the existing exact-name join
 * keeps working). De-duplicated, lowercased — the caller matches
 * case-insensitively.
 */
export function wearableMetricNamesFor(markerName: string): string[] {
  const token = normalizeMarkerToken(markerName);
  const aliases = METRIC_ALIASES[token] ?? [];
  return Array.from(new Set([token, ...aliases.map((a) => a.toLowerCase())]));
}
