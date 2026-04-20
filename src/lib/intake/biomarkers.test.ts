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

describe('G3 — sex hormone + PSA + micronutrient additions', () => {
  it('resolves progesterone and estradiol', () => {
    expect(resolveBiomarker('Progesterone')?.canonicalKey).toBe('progesterone');
    expect(resolveBiomarker('Serum progesterone')?.canonicalKey).toBe('progesterone');
    expect(resolveBiomarker('Estradiol')?.canonicalKey).toBe('estradiol');
    expect(resolveBiomarker('Oestradiol')?.canonicalKey).toBe('estradiol');
    expect(resolveBiomarker('E2')?.canonicalKey).toBe('estradiol');
  });

  it('resolves PSA via short and long forms', () => {
    expect(resolveBiomarker('PSA')?.canonicalKey).toBe('psa');
    expect(resolveBiomarker('psa')?.canonicalKey).toBe('psa');
    expect(resolveBiomarker('Prostate specific antigen')?.canonicalKey).toBe('psa');
    expect(resolveBiomarker('Prostate-specific antigen')?.canonicalKey).toBe('psa');
  });

  it('resolves zinc / selenium / copper via short element symbols (exact-only, < MIN_SUBSTRING_ALIAS_LENGTH)', () => {
    expect(resolveBiomarker('Zinc')?.canonicalKey).toBe('zinc');
    expect(resolveBiomarker('Zn')?.canonicalKey).toBe('zinc');
    expect(resolveBiomarker('Selenium')?.canonicalKey).toBe('selenium');
    expect(resolveBiomarker('Se')?.canonicalKey).toBe('selenium');
    expect(resolveBiomarker('Copper')?.canonicalKey).toBe('copper');
    expect(resolveBiomarker('Cu')?.canonicalKey).toBe('copper');
  });

  it('does NOT false-positive short element symbols inside unrelated prose (MIN_SUBSTRING_ALIAS_LENGTH guard)', () => {
    // "in the zone" contains "zn"? No — but it contains no alias ≥ 4 chars,
    // so nothing should match. Verifies the substring guard prevents the
    // 2-char element symbols from participating in prose-style matching.
    expect(resolveBiomarker('in the zone')).toBeUndefined();
    expect(resolveBiomarker('see you later')).toBeUndefined();
  });

  it('ships reference ranges only where UK consensus is unambiguous', () => {
    expect(resolveBiomarker('zinc')?.referenceRange).toBeDefined();
    expect(resolveBiomarker('selenium')?.referenceRange).toBeDefined();
    expect(resolveBiomarker('copper')?.referenceRange).toBeDefined();
    // Estradiol / progesterone vary dramatically by cycle phase and sex;
    // PSA is age-banded. These intentionally ship without refs.
    expect(resolveBiomarker('estradiol')?.referenceRange).toBeUndefined();
    expect(resolveBiomarker('progesterone')?.referenceRange).toBeUndefined();
    expect(resolveBiomarker('psa')?.referenceRange).toBeUndefined();
  });

  it('grew BIOMARKER_CANONICAL_KEYS by exactly 6', () => {
    for (const key of ['progesterone', 'estradiol', 'psa', 'zinc', 'selenium', 'copper']) {
      expect(BIOMARKER_CANONICAL_KEYS).toContain(key);
    }
    // Pin the total so an accidental duplicate entry or silent extra
    // addition is caught. Mirrors the G2 vital-signs registry pattern.
    expect(BIOMARKER_CANONICAL_KEYS.length).toBe(BIOMARKER_REGISTRY.length);
    expect(new Set(BIOMARKER_CANONICAL_KEYS).size).toBe(BIOMARKER_CANONICAL_KEYS.length);
  });

  it('categorises PSA as tumor_marker (not hormone) so hormone-group queries stay clean', () => {
    // PSA is a serine protease used as a prostate-cancer screening/monitoring
    // marker. It is not a hormone. Keeping it under `tumor_marker` prevents
    // downstream `category === 'hormone'` aggregations from including it
    // alongside testosterone, cortisol, etc.
    expect(resolveBiomarker('PSA')?.category).toBe('tumor_marker');
    expect(getBiomarker('psa')?.category).toBe('tumor_marker');
  });

  it('pre-existing alias resolution still works (no collisions introduced)', () => {
    // Short-alias spot-check: must not steal from iron/magnesium/etc.
    expect(resolveBiomarker('Serum iron')?.canonicalKey).toBe('iron');
    expect(resolveBiomarker('Magnesium')?.canonicalKey).toBe('magnesium');
    expect(resolveBiomarker('Ferritin')?.canonicalKey).toBe('ferritin');
    expect(resolveBiomarker('Vitamin B12')?.canonicalKey).toBe('vitamin_b12');
  });
});
