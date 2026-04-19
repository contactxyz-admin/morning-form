/**
 * Seed vaccine registry — routine UK immunisations. Open registry: unknown
 * vaccines still write successfully as long as `canonicalKey` matches the
 * grammar; the registry is a display/lookup convenience.
 */
import { buildAliasIndex, resolveViaAliasIndex } from './registry-resolve';

export type VaccineCategory =
  | 'routine_childhood'
  | 'routine_adult'
  | 'seasonal'
  | 'travel'
  | 'occupational'
  | 'other';

export interface ImmunisationVaccineEntry {
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly category: VaccineCategory;
  readonly aliases: readonly string[];
}

export const IMMUNISATION_VACCINE_REGISTRY: readonly ImmunisationVaccineEntry[] = [
  { canonicalKey: 'mmr', displayName: 'MMR', category: 'routine_childhood', aliases: ['mmr', 'measles mumps rubella'] },
  { canonicalKey: 'dtap_ipv', displayName: '6-in-1 (DTaP/IPV/Hib/HepB)', category: 'routine_childhood', aliases: ['6-in-1', 'dtap/ipv', 'infanrix hexa'] },
  { canonicalKey: 'menb', displayName: 'MenB', category: 'routine_childhood', aliases: ['menb', 'meningococcal b', 'bexsero'] },
  { canonicalKey: 'rotavirus', displayName: 'Rotavirus', category: 'routine_childhood', aliases: ['rotavirus', 'rotarix'] },
  { canonicalKey: 'pcv', displayName: 'Pneumococcal (PCV)', category: 'routine_childhood', aliases: ['pcv', 'pneumococcal', 'prevenar'] },
  { canonicalKey: 'hib_menc', displayName: 'Hib/MenC', category: 'routine_childhood', aliases: ['hib/menc', 'hib menc'] },
  { canonicalKey: 'hpv', displayName: 'HPV', category: 'routine_childhood', aliases: ['hpv', 'gardasil', 'human papillomavirus'] },
  { canonicalKey: 'td_ipv', displayName: 'Td/IPV (teenage booster)', category: 'routine_childhood', aliases: ['td/ipv', 'teenage booster'] },
  { canonicalKey: 'shingles', displayName: 'Shingles', category: 'routine_adult', aliases: ['shingles', 'zostavax', 'shingrix'] },
  { canonicalKey: 'pneumococcal_adult', displayName: 'Pneumococcal (adult)', category: 'routine_adult', aliases: ['ppv23', 'pneumovax'] },
  { canonicalKey: 'influenza', displayName: 'Influenza', category: 'seasonal', aliases: ['flu', 'influenza', 'flu jab'] },
  { canonicalKey: 'covid19_pfizer', displayName: 'COVID-19 (Pfizer)', category: 'seasonal', aliases: ['covid pfizer', 'comirnaty'] },
  { canonicalKey: 'covid19_moderna', displayName: 'COVID-19 (Moderna)', category: 'seasonal', aliases: ['covid moderna', 'spikevax'] },
  { canonicalKey: 'covid19_astrazeneca', displayName: 'COVID-19 (AstraZeneca)', category: 'seasonal', aliases: ['covid astrazeneca', 'vaxzevria'] },
  { canonicalKey: 'yellow_fever', displayName: 'Yellow fever', category: 'travel', aliases: ['yellow fever', 'stamaril'] },
  { canonicalKey: 'hepatitis_a', displayName: 'Hepatitis A', category: 'travel', aliases: ['hep a', 'hepatitis a', 'havrix'] },
  { canonicalKey: 'hepatitis_b', displayName: 'Hepatitis B', category: 'occupational', aliases: ['hep b', 'hepatitis b', 'engerix'] },
  { canonicalKey: 'typhoid', displayName: 'Typhoid', category: 'travel', aliases: ['typhoid', 'typhim'] },
] as const;

const ALIAS_INDEX = buildAliasIndex(IMMUNISATION_VACCINE_REGISTRY);

/**
 * Minimum alias length for substring matching. Short aliases like "hpv",
 * "flu", "mmr" still resolve exactly via the index; we only restrict
 * the fuzzy substring pass so short aliases can't steal matches from
 * longer prose labels.
 */
const MIN_SUBSTRING_ALIAS_LENGTH = 4;

export function resolveVaccine(label: string): ImmunisationVaccineEntry | undefined {
  return resolveViaAliasIndex(label, ALIAS_INDEX, MIN_SUBSTRING_ALIAS_LENGTH);
}

export const IMMUNISATION_CANONICAL_KEYS: ReadonlySet<string> = new Set(
  IMMUNISATION_VACCINE_REGISTRY.map((e) => e.canonicalKey),
);
