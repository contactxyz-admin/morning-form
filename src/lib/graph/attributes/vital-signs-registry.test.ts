import { describe, expect, it } from 'vitest';
import {
  VITAL_SIGNS_CANONICAL_KEYS,
  VITAL_SIGNS_REGISTRY,
  resolveVitalSign,
} from './vital-signs-registry';
import { validateAttributesForWrite } from './index';

describe('G2 — vital-signs additions (BBT, cycle, DEXA, Bristol)', () => {
  it('resolves basal body temperature via canonical, display, and aliases', () => {
    expect(resolveVitalSign('basal_body_temperature')?.unit).toBe('°C');
    expect(resolveVitalSign('Basal body temperature')?.canonicalKey).toBe('basal_body_temperature');
    expect(resolveVitalSign('BBT')?.canonicalKey).toBe('basal_body_temperature');
    expect(resolveVitalSign('basal body temp')?.canonicalKey).toBe('basal_body_temperature');
  });

  it('keeps temperature_core distinct from basal_body_temperature (D2)', () => {
    // D2: alias-stealing would conflate two clinically different readings.
    expect(resolveVitalSign('temperature')?.canonicalKey).toBe('temperature_core');
    expect(resolveVitalSign('body temp')?.canonicalKey).toBe('temperature_core');
  });

  it('resolves cycle day', () => {
    expect(resolveVitalSign('menstrual_cycle_day')?.unit).toBe('day');
    expect(resolveVitalSign('cycle day')?.canonicalKey).toBe('menstrual_cycle_day');
  });

  it('resolves DEXA derivatives with body_composition context', () => {
    const lean = resolveVitalSign('Lean mass');
    expect(lean?.canonicalKey).toBe('lean_mass');
    expect(lean?.context).toBe('body_composition');
    expect(lean?.unit).toBe('kg');
    expect(resolveVitalSign('Lean body mass')?.canonicalKey).toBe('lean_mass');
    expect(resolveVitalSign('Fat-free mass')?.canonicalKey).toBe('lean_mass');

    expect(resolveVitalSign('Visceral fat rating')?.canonicalKey).toBe('visceral_fat_rating');
    expect(resolveVitalSign('visceral fat')?.canonicalKey).toBe('visceral_fat_rating');

    expect(resolveVitalSign('Bone density Z-score')?.canonicalKey).toBe('bone_density_z_score');
    expect(resolveVitalSign('BMD Z-score')?.canonicalKey).toBe('bone_density_z_score');
  });

  it('resolves bristol stool scale (D3: modelled as observation, not symptom_episode)', () => {
    const b = resolveVitalSign('Bristol stool scale');
    expect(b?.canonicalKey).toBe('bristol_stool_scale');
    expect(b?.unit).toBe('scale');
    expect(resolveVitalSign('bristol scale')?.canonicalKey).toBe('bristol_stool_scale');
    expect(resolveVitalSign('stool type')?.canonicalKey).toBe('bristol_stool_scale');
  });

  it('membership set contains all new canonical keys', () => {
    for (const key of [
      'basal_body_temperature',
      'menstrual_cycle_day',
      'lean_mass',
      'visceral_fat_rating',
      'bone_density_z_score',
      'bristol_stool_scale',
    ]) {
      expect(VITAL_SIGNS_CANONICAL_KEYS.has(key)).toBe(true);
    }
  });

  it('grew by exactly the number of additions (no accidental deletions)', () => {
    // 11 pre-existing + 6 new.
    expect(VITAL_SIGNS_REGISTRY.length).toBe(17);
  });

  it('round-trips a BBT observation through validateAttributesForWrite', () => {
    expect(() =>
      validateAttributesForWrite('observation', 'basal_body_temperature', {
        value: 36.4,
        unit: '°C',
        measuredAt: '2026-04-20T06:30:00Z',
        context: 'self',
      }),
    ).not.toThrow();
  });

  it('round-trips a Bristol stool scale observation through validateAttributesForWrite', () => {
    expect(() =>
      validateAttributesForWrite('observation', 'bristol_stool_scale', {
        value: 4,
        unit: 'scale',
        measuredAt: '2026-04-20T07:00:00Z',
        context: 'self',
      }),
    ).not.toThrow();
  });
});
