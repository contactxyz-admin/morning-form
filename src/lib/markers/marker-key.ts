/**
 * Canonical join key for matching a marker across surfaces (longitudinal
 * plan 2026-06-10-003 U1).
 *
 * The LLM can emit the registry canonicalKey on one panel and a snake_case
 * fallback on another, both for the same marker. The registry key, when the
 * label resolved, is the stable identity; the node's own canonicalKey is the
 * fallback. Lowercased so case never splits a match. Single source of truth
 * shared by the panel diff (which keys its per-panel readings) and the
 * record route (which maps a change back onto its biomarker concept node).
 */
export function markerJoinKey(canonicalKey: string, registryKey?: unknown): string {
  const key =
    typeof registryKey === 'string' && registryKey.length > 0 ? registryKey : canonicalKey;
  return key.toLowerCase();
}
