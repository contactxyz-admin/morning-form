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

describe('T6 registry additions', () => {
  it('resolves cardiac-risk markers by common lab labels', () => {
    expect(resolveBiomarker('Apolipoprotein B')?.canonicalKey).toBe('apolipoprotein_b');
    expect(resolveBiomarker('apoB')?.canonicalKey).toBe('apolipoprotein_b');
    expect(resolveBiomarker('Lp(a)')?.canonicalKey).toBe('lipoprotein_a');
    expect(resolveBiomarker('Homocysteine')?.canonicalKey).toBe('homocysteine');
    expect(resolveBiomarker('Omega-3 index')?.canonicalKey).toBe('omega_3_index');
  });

  it('hs-CRP resolves to hscrp (not the shorter crp alias)', () => {
    expect(resolveBiomarker('hs-CRP')?.canonicalKey).toBe('hscrp');
    expect(resolveBiomarker('High sensitivity CRP')?.canonicalKey).toBe('hscrp');
    expect(resolveBiomarker('CRP')?.canonicalKey).toBe('crp');
  });

  it('resolves hormone additions', () => {
    expect(resolveBiomarker('Free testosterone')?.canonicalKey).toBe('free_testosterone');
    expect(resolveBiomarker('DHEA-S')?.canonicalKey).toBe('dhea_sulfate');
    expect(resolveBiomarker('IGF-1')?.canonicalKey).toBe('igf_1');
    expect(resolveBiomarker('Reverse T3')?.canonicalKey).toBe('reverse_t3');
    expect(resolveBiomarker('Active B12')?.canonicalKey).toBe('vitamin_b12_active');
  });

  it('resolves fertility markers', () => {
    expect(resolveBiomarker('AMH')?.canonicalKey).toBe('amh');
    expect(resolveBiomarker('Anti-Mullerian hormone')?.canonicalKey).toBe('amh');
    expect(resolveBiomarker('Sperm concentration')?.canonicalKey).toBe('sperm_concentration');
    expect(resolveBiomarker('Progressive motility')?.canonicalKey).toBe('sperm_motility_progressive');
    expect(resolveBiomarker('Normal morphology')?.canonicalKey).toBe('sperm_morphology_normal');
  });

  it('resolves microbiome diversity indices', () => {
    expect(resolveBiomarker('Shannon diversity')?.canonicalKey).toBe('microbiome_shannon_diversity');
    expect(resolveBiomarker('Simpson index')?.canonicalKey).toBe('microbiome_simpson_diversity');
  });

  it('existing resolve behaviour preserved (no alias collisions)', () => {
    expect(resolveBiomarker('Ferritin')?.canonicalKey).toBe('ferritin');
    expect(resolveBiomarker('CRP')?.canonicalKey).toBe('crp');
    expect(resolveBiomarker('Free T3')?.canonicalKey).toBe('free_t3');
    expect(resolveBiomarker('Vitamin B12 (cobalamin)')?.canonicalKey).toBe('vitamin_b12');
  });
});
