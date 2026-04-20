import { describe, expect, it } from 'vitest';
import { LifestyleAttributesSchema, LIFESTYLE_SUBTYPES } from './lifestyle';
import { validateAttributesForWrite } from './index';
import { NodeAttributesValidationError } from '../errors';

describe('G4 — sun_exposure + social_isolation lifestyle subtypes', () => {
  it('includes the two new subtypes in the LIFESTYLE_SUBTYPES tuple', () => {
    expect(LIFESTYLE_SUBTYPES).toContain('sun_exposure');
    expect(LIFESTYLE_SUBTYPES).toContain('social_isolation');
    // 14 pre-existing + 2 new.
    expect(LIFESTYLE_SUBTYPES.length).toBe(16);
  });

  it('accepts a well-formed sun_exposure row', () => {
    const parsed = LifestyleAttributesSchema.parse({
      lifestyleSubtype: 'sun_exposure',
      sessionsPerWeek: 4,
      avgDurationMinutes: 30,
      uvIndex: 7,
      usedSunscreen: true,
      startedOn: '2026-04-01',
    });
    expect(parsed).toMatchObject({
      lifestyleSubtype: 'sun_exposure',
      sessionsPerWeek: 4,
      usedSunscreen: true,
    });
  });

  it('accepts a well-formed social_isolation row', () => {
    const parsed = LifestyleAttributesSchema.parse({
      lifestyleSubtype: 'social_isolation',
      selfRated: 7,
      pattern: 'frequent',
      startedOn: '2026-03-01',
    });
    expect(parsed).toMatchObject({
      lifestyleSubtype: 'social_isolation',
      selfRated: 7,
      pattern: 'frequent',
    });
  });

  it('rejects sun_exposure with an unknown field (strict branch)', () => {
    expect(() =>
      validateAttributesForWrite('lifestyle', 'sun_2026', {
        lifestyleSubtype: 'sun_exposure',
        sessionsPerWeek: 3,
        bogus: true,
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('rejects social_isolation selfRated out of 0-10 range', () => {
    expect(() =>
      validateAttributesForWrite('lifestyle', 'isolation_bad', {
        lifestyleSubtype: 'social_isolation',
        selfRated: 11,
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('rejects social_isolation with an invalid pattern enum value', () => {
    expect(() =>
      validateAttributesForWrite('lifestyle', 'isolation_bad_pat', {
        lifestyleSubtype: 'social_isolation',
        pattern: 'constant' as unknown as 'daily',
      }),
    ).toThrow(NodeAttributesValidationError);
  });

  it('routes uppercase SUN_EXPOSURE through the preprocess lowercase step', () => {
    // The existing preprocess (added in the CE-review fix) lowercases any
    // lifestyleSubtype string before discriminator lookup. New branches
    // inherit that routing unchanged.
    const parsed = LifestyleAttributesSchema.parse({
      lifestyleSubtype: 'SUN_EXPOSURE',
      sessionsPerWeek: 2,
    });
    expect(parsed).toMatchObject({ lifestyleSubtype: 'sun_exposure' });
  });

  it('leaves pre-existing branches unaffected', () => {
    // Spot-check: diet, caffeine, stress, exposure_environmental still round-trip.
    expect(() =>
      LifestyleAttributesSchema.parse({
        lifestyleSubtype: 'diet',
        pattern: 'mediterranean',
        avgProteinGramsPerDay: 100,
      }),
    ).not.toThrow();
    expect(() =>
      LifestyleAttributesSchema.parse({
        lifestyleSubtype: 'stress',
        selfRated: 5,
        primaryDomain: 'family',
      }),
    ).not.toThrow();
    expect(() =>
      LifestyleAttributesSchema.parse({
        lifestyleSubtype: 'exposure_environmental',
        agent: 'diesel exhaust',
        severity: 'moderate',
      }),
    ).not.toThrow();
  });

  it('preserves the supplement redirection (sentinel + superRefine untouched)', () => {
    expect(() =>
      validateAttributesForWrite('lifestyle', 'sup', {
        lifestyleSubtype: 'supplement',
        quantity: '400 mg',
      }),
    ).toThrow(NodeAttributesValidationError);
  });
});
