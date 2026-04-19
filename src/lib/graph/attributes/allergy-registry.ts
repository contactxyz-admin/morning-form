/**
 * Seed allergy reactant registry — common UK drug, food, and environmental
 * reactants. Open registry: unknown reactants still write successfully as
 * long as `canonicalKey` matches the grammar; callers pass an explicit
 * `reactantClass` when there's no registry match.
 */
import { buildAliasIndex, resolveViaAliasIndex } from './registry-resolve';

export type ReactantClass = 'drug' | 'food' | 'environmental' | 'venom' | 'other';

export interface AllergyReactantEntry {
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly reactantClass: ReactantClass;
  readonly aliases: readonly string[];
}

export const ALLERGY_REACTANT_REGISTRY: readonly AllergyReactantEntry[] = [
  // Drugs
  { canonicalKey: 'penicillin', displayName: 'Penicillin', reactantClass: 'drug', aliases: ['penicillin', 'penicillins'] },
  { canonicalKey: 'amoxicillin', displayName: 'Amoxicillin', reactantClass: 'drug', aliases: ['amoxicillin'] },
  { canonicalKey: 'cephalosporin', displayName: 'Cephalosporins', reactantClass: 'drug', aliases: ['cephalosporin', 'cephalosporins', 'cefalexin'] },
  { canonicalKey: 'sulfonamide', displayName: 'Sulfonamides', reactantClass: 'drug', aliases: ['sulfonamide', 'sulphonamide', 'sulfa'] },
  { canonicalKey: 'aspirin', displayName: 'Aspirin', reactantClass: 'drug', aliases: ['aspirin', 'asa', 'acetylsalicylic acid'] },
  { canonicalKey: 'ibuprofen', displayName: 'Ibuprofen', reactantClass: 'drug', aliases: ['ibuprofen', 'nurofen', 'advil'] },
  { canonicalKey: 'nsaids', displayName: 'NSAIDs', reactantClass: 'drug', aliases: ['nsaid', 'nsaids', 'non-steroidal'] },
  { canonicalKey: 'codeine', displayName: 'Codeine', reactantClass: 'drug', aliases: ['codeine'] },
  { canonicalKey: 'morphine', displayName: 'Morphine', reactantClass: 'drug', aliases: ['morphine'] },
  { canonicalKey: 'latex', displayName: 'Latex', reactantClass: 'drug', aliases: ['latex', 'rubber latex'] },
  { canonicalKey: 'iodinated_contrast', displayName: 'Iodinated contrast', reactantClass: 'drug', aliases: ['iodinated contrast', 'ct contrast', 'contrast media'] },

  // Foods
  { canonicalKey: 'peanut', displayName: 'Peanut', reactantClass: 'food', aliases: ['peanut', 'peanuts', 'groundnut'] },
  { canonicalKey: 'tree_nuts', displayName: 'Tree nuts', reactantClass: 'food', aliases: ['tree nut', 'tree nuts', 'almond', 'walnut', 'cashew', 'hazelnut'] },
  { canonicalKey: 'shellfish', displayName: 'Shellfish', reactantClass: 'food', aliases: ['shellfish', 'crustacean', 'prawn', 'shrimp', 'lobster'] },
  { canonicalKey: 'fish', displayName: 'Fish', reactantClass: 'food', aliases: ['fish allergy', 'finfish'] },
  { canonicalKey: 'milk', displayName: 'Cow’s milk', reactantClass: 'food', aliases: ['milk', 'cow milk', 'dairy'] },
  { canonicalKey: 'egg', displayName: 'Egg', reactantClass: 'food', aliases: ['egg', 'eggs'] },
  { canonicalKey: 'soy', displayName: 'Soy', reactantClass: 'food', aliases: ['soy', 'soya', 'soybean'] },
  { canonicalKey: 'wheat', displayName: 'Wheat', reactantClass: 'food', aliases: ['wheat'] },
  { canonicalKey: 'gluten', displayName: 'Gluten', reactantClass: 'food', aliases: ['gluten', 'coeliac trigger'] },
  { canonicalKey: 'sesame', displayName: 'Sesame', reactantClass: 'food', aliases: ['sesame', 'tahini'] },

  // Environmental
  { canonicalKey: 'pollen', displayName: 'Pollen', reactantClass: 'environmental', aliases: ['pollen', 'hayfever trigger'] },
  { canonicalKey: 'grass_pollen', displayName: 'Grass pollen', reactantClass: 'environmental', aliases: ['grass pollen', 'grass'] },
  { canonicalKey: 'tree_pollen', displayName: 'Tree pollen', reactantClass: 'environmental', aliases: ['tree pollen'] },
  { canonicalKey: 'dust_mite', displayName: 'House dust mite', reactantClass: 'environmental', aliases: ['dust mite', 'house dust mite', 'hdm'] },
  { canonicalKey: 'cat_dander', displayName: 'Cat dander', reactantClass: 'environmental', aliases: ['cat dander', 'cat'] },
  { canonicalKey: 'dog_dander', displayName: 'Dog dander', reactantClass: 'environmental', aliases: ['dog dander', 'dog'] },
  { canonicalKey: 'mould', displayName: 'Mould', reactantClass: 'environmental', aliases: ['mould', 'mold'] },

  // Venom
  { canonicalKey: 'bee_venom', displayName: 'Bee venom', reactantClass: 'venom', aliases: ['bee sting', 'bee venom'] },
  { canonicalKey: 'wasp_venom', displayName: 'Wasp venom', reactantClass: 'venom', aliases: ['wasp sting', 'wasp venom', 'hornet'] },
] as const;

const ALIAS_INDEX = buildAliasIndex(ALLERGY_REACTANT_REGISTRY);

/**
 * Minimum alias length for substring matching. Short aliases like "asa",
 * "cat", "dog", "egg", "fish" are common English words that produce false
 * positives when treated as substrings of free-form prose ("he ate salmon
 * and was fine" should not resolve to fish allergy). Exact matches via
 * the index still resolve those short aliases — we only restrict the
 * fuzzy substring pass.
 */
const MIN_SUBSTRING_ALIAS_LENGTH = 4;

/**
 * Resolve a free-form label to a registry entry. Case-insensitive longest-
 * alias-first substring match — same contract as `resolveBiomarker`.
 */
export function resolveAllergyReactant(label: string): AllergyReactantEntry | undefined {
  return resolveViaAliasIndex(label, ALIAS_INDEX, MIN_SUBSTRING_ALIAS_LENGTH);
}

export const ALLERGY_REACTANT_CANONICAL_KEYS: ReadonlySet<string> = new Set(
  ALLERGY_REACTANT_REGISTRY.map((e) => e.canonicalKey),
);
