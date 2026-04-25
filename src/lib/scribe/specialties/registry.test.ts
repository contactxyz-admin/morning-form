import { describe, expect, it } from 'vitest';
import {
  getSpecialty,
  isCoreSpecialty,
  isStubSpecialty,
  listCoreSpecialties,
  listCoreSpecialtyKeys,
  listSpecialties,
  listStubSpecialties,
} from './registry';

describe('specialty registry — shape', () => {
  it('returns a core entry with non-null prompt path for cardiometabolic', () => {
    const s = getSpecialty('cardiometabolic');
    expect(s).toBeDefined();
    expect(s?.status).toBe('core');
    expect(s?.systemPromptPath).not.toBeNull();
    expect(s?.safetyPolicyKey).not.toBeNull();
  });

  it('returns a stub entry with null prompt path for mental-health', () => {
    const s = getSpecialty('mental-health');
    expect(s).toBeDefined();
    expect(s?.status).toBe('stub');
    expect(s?.systemPromptPath).toBeNull();
    expect(s?.safetyPolicyKey).toBeNull();
    expect(s?.referralFallbackMessage).toBeTruthy();
  });

  it('returns undefined for an unregistered key', () => {
    expect(getSpecialty('not-a-key')).toBeUndefined();
  });

  it('listCoreSpecialties returns general + 3 specialists = 4 entries', () => {
    const core = listCoreSpecialties();
    expect(core).toHaveLength(4);
    const keys = core.map((s) => s.key).sort();
    expect(keys).toEqual(['cardiometabolic', 'general', 'hormonal-endocrine', 'sleep-recovery']);
  });

  it('every core specialty has a non-null systemPromptPath and safetyPolicyKey', () => {
    for (const s of listCoreSpecialties()) {
      expect(s.systemPromptPath).not.toBeNull();
      expect(s.safetyPolicyKey).not.toBeNull();
    }
  });

  it('every stub specialty has null systemPromptPath, null safetyPolicyKey, and a fallback message', () => {
    const stubs = listStubSpecialties();
    expect(stubs.length).toBeGreaterThanOrEqual(5);
    for (const s of stubs) {
      expect(s.systemPromptPath).toBeNull();
      expect(s.safetyPolicyKey).toBeNull();
      expect(s.referralFallbackMessage).toBeTruthy();
    }
  });

  it('keys are unique across the full registry', () => {
    const all = listSpecialties();
    const keys = all.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('isCoreSpecialty returns true for core, false for stub, false for unknown', () => {
    expect(isCoreSpecialty('cardiometabolic')).toBe(true);
    expect(isCoreSpecialty('mental-health')).toBe(false);
    expect(isCoreSpecialty('not-a-key')).toBe(false);
  });

  it('isStubSpecialty returns true for stub, false for core, false for unknown', () => {
    expect(isStubSpecialty('mental-health')).toBe(true);
    expect(isStubSpecialty('cardiometabolic')).toBe(false);
    expect(isStubSpecialty('not-a-key')).toBe(false);
  });

  it('listCoreSpecialtyKeys returns just the keys, sorted-stable from the array', () => {
    const keys = listCoreSpecialtyKeys();
    expect(keys).toContain('general');
    expect(keys).toContain('cardiometabolic');
    expect(keys).toContain('sleep-recovery');
    expect(keys).toContain('hormonal-endocrine');
    expect(keys).not.toContain('mental-health');
  });

  it('registry is frozen (cannot be mutated by callers)', () => {
    const all = listSpecialties() as Array<unknown>;
    expect(() => all.push({} as never)).toThrow();
  });

  it('every specialty has a non-empty displayName and scope', () => {
    for (const s of listSpecialties()) {
      expect(s.displayName.trim().length).toBeGreaterThan(0);
      expect(s.scope.trim().length).toBeGreaterThan(0);
    }
  });
});
