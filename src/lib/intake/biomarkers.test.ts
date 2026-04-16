import { describe, expect, it } from 'vitest';
import {
  BIOMARKER_REGISTRY,
  BIOMARKER_CANONICAL_KEYS,
  getBiomarker,
  resolveBiomarker,
} from './biomarkers';

describe('biomarker registry', () => {
  it('has ≥40 entries covering the Iron/Sleep/Energy topic biomarkers', () => {
    expect(BIOMARKER_REGISTRY.length).toBeGreaterThanOrEqual(40);
    for (const required of [
      'ferritin',
      'iron',
      'tibc',
      'transferrin_saturation',
      'haemoglobin',
      'tsh',
      'free_t4',
      'vitamin_d',
      'vitamin_b12',
      'folate',
      'crp',
      'hba1c',
    ]) {
      expect(BIOMARKER_CANONICAL_KEYS).toContain(required);
    }
  });

  it('every entry has a snake_case canonicalKey and ≥1 alias', () => {
    const snakeCase = /^[a-z0-9][a-z0-9_]*$/;
    for (const entry of BIOMARKER_REGISTRY) {
      expect(entry.canonicalKey).toMatch(snakeCase);
      expect(entry.aliases.length).toBeGreaterThanOrEqual(1);
      expect(entry.displayName.length).toBeGreaterThan(0);
    }
  });

  it('canonicalKeys are unique', () => {
    const keys = BIOMARKER_REGISTRY.map((b) => b.canonicalKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('getBiomarker', () => {
  it('returns entries by canonicalKey', () => {
    const entry = getBiomarker('ferritin');
    expect(entry?.displayName).toBe('Ferritin');
    expect(entry?.unit).toBe('ug/L');
  });

  it('returns undefined for unknown keys', () => {
    expect(getBiomarker('not_a_biomarker')).toBeUndefined();
  });
});

describe('resolveBiomarker (alias matching)', () => {
  it('matches exact canonical labels', () => {
    expect(resolveBiomarker('Ferritin')?.canonicalKey).toBe('ferritin');
    expect(resolveBiomarker('Haemoglobin')?.canonicalKey).toBe('haemoglobin');
  });

  it('case-insensitive', () => {
    expect(resolveBiomarker('FERRITIN')?.canonicalKey).toBe('ferritin');
    expect(resolveBiomarker('ferritin')?.canonicalKey).toBe('ferritin');
  });

  it('matches UK abbreviations from lab reports', () => {
    expect(resolveBiomarker('Hb')?.canonicalKey).toBe('haemoglobin');
    expect(resolveBiomarker('MCV')?.canonicalKey).toBe('mcv');
    expect(resolveBiomarker('ALT')?.canonicalKey).toBe('alt');
  });

  it('matches US spelling variants', () => {
    expect(resolveBiomarker('Hemoglobin')?.canonicalKey).toBe('haemoglobin');
    expect(resolveBiomarker('Hematocrit')?.canonicalKey).toBe('haematocrit');
  });

  it('matches substrings inside lab-label prose', () => {
    expect(resolveBiomarker('Serum ferritin level')?.canonicalKey).toBe('ferritin');
    expect(resolveBiomarker('Vitamin B12 (cobalamin)')?.canonicalKey).toBe('vitamin_b12');
  });

  it('resolves longest-alias-first when both overlap', () => {
    // "free t3" must beat any shorter token like "t3" alone.
    expect(resolveBiomarker('Free T3')?.canonicalKey).toBe('free_t3');
    expect(resolveBiomarker('Free T4 level')?.canonicalKey).toBe('free_t4');
    // "transferrin saturation" must beat "transferrin"-only (which isn't in registry anyway).
    expect(resolveBiomarker('Transferrin saturation')?.canonicalKey).toBe('transferrin_saturation');
  });

  it('returns undefined for analytes not in the registry', () => {
    expect(resolveBiomarker('Serum myeloperoxidase')).toBeUndefined();
    expect(resolveBiomarker('Galectin-3')).toBeUndefined();
  });
});
