/**
 * Shared alias-resolution helper for the taxonomy seed registries
 * (allergy-registry, immunisation-registry, vital-signs-registry,
 * biomarkers). The contract is always the same:
 *   1. lowercase the needle
 *   2. exact-alias lookup via `index.get(needle)`
 *   3. fallback: longest-alias-first substring match, gated by a minimum
 *      alias length so short aliases ("hb", "alt", "cat") don't steal
 *      matches from free-form prose
 *
 * Factoring it here keeps the substring-vs-exact contract consistent
 * across registries and removes the forEach / Map traversal duplication
 * that accumulated across T2/T4/T5.
 */

export interface RegistryEntryWithAliases {
  readonly aliases: readonly string[];
}

// Last-write-wins on alias collisions. Preserves the pre-refactor semantics
// of the per-registry implementations this helper replaced (allergy-registry,
// immunisation-registry). Seed registries today have no cross-entry alias
// collisions, but future additions with an overlapping alias should resolve
// to the later-declared entry, not silently route to the earlier one.
export function buildAliasIndex<T extends RegistryEntryWithAliases>(
  registry: readonly T[],
): ReadonlyMap<string, T> {
  const idx = new Map<string, T>();
  for (const entry of registry) {
    for (const alias of entry.aliases) {
      idx.set(alias.toLowerCase(), entry);
    }
  }
  return idx;
}

export function resolveViaAliasIndex<T>(
  label: string,
  index: ReadonlyMap<string, T>,
  minSubstringLength: number,
): T | undefined {
  const needle = label.toLowerCase();
  const exact = index.get(needle);
  if (exact) return exact;
  let best: { entry: T; aliasLength: number } | undefined;
  index.forEach((entry, alias) => {
    if (
      alias.length >= minSubstringLength &&
      needle.includes(alias) &&
      (!best || alias.length > best.aliasLength)
    ) {
      best = { entry, aliasLength: alias.length };
    }
  });
  return best?.entry;
}
