/**
 * Canonical-key helpers for the taxonomy families added in T2/T3/T7 (T9).
 *
 * `CANONICAL_KEY_RE` (the intake regex) stays the source of truth for the
 * shape of stored keys — these helpers only guarantee their output matches
 * it. The helpers are advisory: the extraction LLM can still emit any key
 * that passes the regex, but deterministic code paths (structured imports,
 * seed data, FHIR adapters per parent U7) should use `canonicalKeyFor` so
 * dedup collapses on repeat imports instead of generating near-duplicate
 * nodes that differ only in capitalisation, punctuation, or filler words.
 */
import { ALLERGY_REACTANT_REGISTRY, resolveAllergyReactant } from './attributes/allergy-registry';
import { IMMUNISATION_VACCINE_REGISTRY, resolveVaccine } from './attributes/immunisation-registry';

/** Mirrors `CANONICAL_KEY_RE` in src/lib/intake/extract.ts. Duplicated to
 *  avoid a deps cycle; the intake import still owns write-time validation. */
export const CANONICAL_KEY_RE = /^[a-z0-9][a-z0-9_]*$/;

/**
 * Stopwords stripped from slugified display strings so "The GP Surgery"
 * and "GP Surgery" produce the same key. Deliberately short — we only
 * strip words that add noise without identity. Domain words
 * (e.g. "hospital", "clinic") are kept because they disambiguate between
 * encounters.
 */
const SLUG_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  'or',
  'at',
  'for',
  'with',
  'to',
]);

/**
 * Lowercase + non-alphanumeric → whitespace + split + filter stopwords +
 * join with underscores. Output is guaranteed to match `CANONICAL_KEY_RE`
 * or be the empty string. Callers decide what to do with empty output.
 */
export function slugify(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((tok) => tok.length > 0 && !SLUG_STOPWORDS.has(tok));
  const joined = tokens.join('_');
  return joined.replace(/^_+|_+$/g, '');
}

/**
 * Tokenised match: all alias tokens must appear in the label's token set.
 * Used as a fallback when the registry's substring match misses on
 * re-ordered words ("Pfizer COVID-19" vs alias "covid pfizer"). Returns
 * the registry entry whose alias matched the most tokens (longest match
 * wins on ties).
 */
function tokenisedRegistryMatch<T extends { aliases: readonly string[] }>(
  label: string,
  registry: readonly T[],
): T | undefined {
  const labelTokens = new Set(slugify(label).split('_').filter(Boolean));
  if (labelTokens.size === 0) return undefined;
  let best: { entry: T; matched: number } | undefined;
  for (const entry of registry) {
    for (const alias of entry.aliases) {
      const aliasTokens = slugify(alias).split('_').filter(Boolean);
      if (aliasTokens.length === 0) continue;
      if (aliasTokens.every((t) => labelTokens.has(t))) {
        const matched = aliasTokens.length;
        if (!best || matched > best.matched) {
          best = { entry, matched };
        }
      }
    }
  }
  return best?.entry;
}

function datePartsFromString(value: string | Date): {
  yyyy: string;
  mm: string;
  dd: string;
  hh: string;
  min: string;
  ss: string;
} {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`canonicalKeyFor: invalid date input "${String(value)}"`);
  }
  const iso = d.toISOString();
  return {
    yyyy: iso.slice(0, 4),
    mm: iso.slice(5, 7),
    dd: iso.slice(8, 10),
    hh: iso.slice(11, 13),
    min: iso.slice(14, 16),
    ss: iso.slice(17, 19),
  };
}

export interface EncounterKeyInput {
  date: string | Date;
  /** Free-form label for the encounter service (e.g. "GP Surgery", "A&E"). */
  serviceDisplay: string;
  /**
   * Optional disambiguator for multiple encounters on the same day at the
   * same service (e.g. morning + afternoon GP visit, or two A&E
   * attendances). When the upstream system (GP Connect, hospital EPR)
   * exposes a stable encounter identifier, pass it here and it is slugified
   * into the key. When absent, an ISO datetime in `date` with a non-zero
   * time component will fold `hhmmss` into the key instead. Callers that
   * pass only a date (no time, no ref) accept the legacy one-per-day
   * collapse and are responsible for avoiding duplicate writes themselves.
   */
  encounterRef?: string;
}

export interface SymptomEpisodeKeyInput {
  onsetAt: string | Date;
  /**
   * Optional canonical key of the parent symptom. When provided it is
   * folded into the episode key so two concurrent episodes of different
   * symptoms don't collapse onto the same canonical id. Callers writing
   * through `ingestExtraction` should pass this whenever a parent symptom
   * is known.
   */
  parentSymptomKey?: string;
}

export function canonicalKeyFor(type: 'encounter', input: EncounterKeyInput): string;
export function canonicalKeyFor(type: 'allergy', input: string): string;
export function canonicalKeyFor(type: 'immunisation', input: string): string;
export function canonicalKeyFor(type: 'symptom_episode', input: SymptomEpisodeKeyInput): string;
export function canonicalKeyFor(
  type: 'encounter' | 'allergy' | 'immunisation' | 'symptom_episode',
  input: EncounterKeyInput | SymptomEpisodeKeyInput | string,
): string {
  switch (type) {
    case 'encounter': {
      const { date, serviceDisplay, encounterRef } = input as EncounterKeyInput;
      const { yyyy, mm, dd, hh, min, ss } = datePartsFromString(date);
      const slug = slugify(serviceDisplay);
      // Disambiguator selection:
      //   1. explicit encounterRef (provider id) — strongest, always folds in
      //   2. caller provided time info (Date instance, or ISO string with a
      //      time component) — fold hhmmss
      //   3. bare-date string ('YYYY-MM-DD') — legacy one-per-day collapse
      //
      // `hasTime` reflects the input's provenance, not the UTC-converted
      // parts. Inspecting `hh/min/ss` against '000000' would fold the key
      // for any Date constructed in a non-UTC timezone (server-TZ-dependent
      // keys) and would silently skip folding for an offset-suffixed ISO
      // that happens to normalise to midnight UTC.
      const refSlug = encounterRef ? slugify(encounterRef) : '';
      const hasTime = date instanceof Date ? true : /[T ]\d{2}:\d{2}/.test(date);
      const disambiguator = refSlug || (hasTime ? `${hh}${min}${ss}` : '');
      const parts = [
        `encounter_${yyyy}_${mm}_${dd}`,
        slug || null,
        disambiguator || null,
      ].filter((p): p is string => Boolean(p));
      return assertCanonical(parts.join('_'));
    }
    case 'allergy': {
      const label = input as string;
      const registryHit =
        resolveAllergyReactant(label) ?? tokenisedRegistryMatch(label, ALLERGY_REACTANT_REGISTRY);
      if (registryHit) return registryHit.canonicalKey;
      const slug = slugify(label);
      if (!slug) throw new Error(`canonicalKeyFor('allergy'): empty slug for "${label}"`);
      return assertCanonical(slug);
    }
    case 'immunisation': {
      const label = input as string;
      const registryHit =
        resolveVaccine(label) ?? tokenisedRegistryMatch(label, IMMUNISATION_VACCINE_REGISTRY);
      if (registryHit) return registryHit.canonicalKey;
      const slug = slugify(label);
      if (!slug) throw new Error(`canonicalKeyFor('immunisation'): empty slug for "${label}"`);
      return assertCanonical(slug);
    }
    case 'symptom_episode': {
      const { onsetAt, parentSymptomKey } = input as SymptomEpisodeKeyInput;
      const { yyyy, mm, dd, hh, min, ss } = datePartsFromString(onsetAt);
      const stamp = `${yyyy}_${mm}_${dd}_${hh}${min}${ss}`;
      // Parent key must already match the canonical-key grammar — embed as-is.
      if (parentSymptomKey && !CANONICAL_KEY_RE.test(parentSymptomKey)) {
        throw new Error(
          `canonicalKeyFor('symptom_episode'): parentSymptomKey "${parentSymptomKey}" does not match canonical-key grammar`,
        );
      }
      const key = parentSymptomKey
        ? `episode_${parentSymptomKey}_${stamp}`
        : `episode_${stamp}`;
      return assertCanonical(key);
    }
    default: {
      const exhaustive: never = type;
      throw new Error(`canonicalKeyFor: unhandled type ${String(exhaustive)}`);
    }
  }
}

function assertCanonical(key: string): string {
  if (!CANONICAL_KEY_RE.test(key)) {
    throw new Error(`canonicalKeyFor produced invalid key "${key}" (expected /${CANONICAL_KEY_RE.source}/)`);
  }
  return key;
}
