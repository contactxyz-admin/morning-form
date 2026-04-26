import { afterEach, describe, expect, it } from 'vitest';
import { CARDIOMETABOLIC_POLICY } from '@/lib/scribe/policy/cardiometabolic';
import { HORMONAL_ENDOCRINE_POLICY } from '@/lib/scribe/policy/hormonal-endocrine';
import { SLEEP_RECOVERY_POLICY } from '@/lib/scribe/policy/sleep-recovery';
import { getPolicy, listTopicPolicyKeys } from '@/lib/scribe/policy/registry';
import { getSpecialty, listCoreSpecialties } from './registry';
import { clearSpecialtyPromptCache, loadSpecialtySystemPrompt } from './load-prompt';

afterEach(() => {
  clearSpecialtyPromptCache();
});

describe('core specialists — policy registration', () => {
  it('registers cardiometabolic, sleep-recovery, hormonal-endocrine in the topic-policy registry', () => {
    const keys = listTopicPolicyKeys();
    expect(keys).toContain('cardiometabolic');
    expect(keys).toContain('sleep-recovery');
    expect(keys).toContain('hormonal-endocrine');
  });

  it('cardiometabolic policy is reachable through getPolicy', () => {
    expect(getPolicy('cardiometabolic')).toBe(CARDIOMETABOLIC_POLICY);
  });

  it('sleep-recovery policy is reachable through getPolicy', () => {
    expect(getPolicy('sleep-recovery')).toBe(SLEEP_RECOVERY_POLICY);
  });

  it('hormonal-endocrine policy is reachable through getPolicy', () => {
    expect(getPolicy('hormonal-endocrine')).toBe(HORMONAL_ENDOCRINE_POLICY);
  });

  it('every core specialty key matches its safetyPolicyKey to a registered policy', () => {
    for (const specialty of listCoreSpecialties()) {
      expect(specialty.safetyPolicyKey).not.toBeNull();
      expect(getPolicy(specialty.safetyPolicyKey!)).toBeDefined();
    }
  });
});

describe('core specialists — policy shape', () => {
  it('cardiometabolic allows all four judgment kinds (broad metabolic remit)', () => {
    expect(CARDIOMETABOLIC_POLICY.allowedJudgmentKinds).toEqual([
      'reference-range-comparison',
      'pattern-vs-own-history',
      'citation-surfacing',
      'definition-lookup',
    ]);
  });

  it('hormonal-endocrine allows all four judgment kinds (definition lookup is core)', () => {
    expect(HORMONAL_ENDOCRINE_POLICY.allowedJudgmentKinds).toEqual([
      'reference-range-comparison',
      'pattern-vs-own-history',
      'citation-surfacing',
      'definition-lookup',
    ]);
  });

  it('cardiometabolic and hormonal-endocrine route out-of-scope to discussWithClinician', () => {
    expect(CARDIOMETABOLIC_POLICY.outOfScopeRoute).toBe('discussWithClinician');
    expect(HORMONAL_ENDOCRINE_POLICY.outOfScopeRoute).toBe('discussWithClinician');
  });

  it('all three core-specialist policies share the same forbidden phrase patterns', () => {
    expect(CARDIOMETABOLIC_POLICY.forbiddenPhrasePatterns).toBe(
      SLEEP_RECOVERY_POLICY.forbiddenPhrasePatterns,
    );
    expect(HORMONAL_ENDOCRINE_POLICY.forbiddenPhrasePatterns).toBe(
      SLEEP_RECOVERY_POLICY.forbiddenPhrasePatterns,
    );
  });
});

describe('core specialists — system prompts', () => {
  it.each([
    ['cardiometabolic', /cardiometabolic specialist/i],
    ['sleep-recovery', /sleep & recovery specialist/i],
    ['hormonal-endocrine', /hormonal & endocrine specialist/i],
  ])('loads the system prompt for %s', (key, headerPattern) => {
    const prompt = loadSpecialtySystemPrompt(key);
    expect(prompt).toBeDefined();
    expect(prompt).toMatch(headerPattern);
  });

  it('every core specialty has a non-null systemPromptPath that resolves to a non-empty file', () => {
    for (const specialty of listCoreSpecialties()) {
      expect(specialty.systemPromptPath).not.toBeNull();
      const prompt = loadSpecialtySystemPrompt(specialty.key);
      expect(prompt).toBeDefined();
      expect(prompt!.trim().length).toBeGreaterThan(0);
    }
  });

  it('each specialist prompt forbids medication naming explicitly', () => {
    for (const key of ['cardiometabolic', 'sleep-recovery', 'hormonal-endocrine']) {
      const prompt = loadSpecialtySystemPrompt(key)!;
      expect(prompt).toMatch(/never name medications/i);
    }
  });

  it('each specialist prompt mentions route_to_gp_prep as the safety net', () => {
    for (const key of ['cardiometabolic', 'sleep-recovery', 'hormonal-endocrine']) {
      const prompt = loadSpecialtySystemPrompt(key)!;
      expect(prompt).toContain('route_to_gp_prep');
    }
  });

  it('the cardiometabolic prompt names the iron sub-domain it absorbs', () => {
    const prompt = loadSpecialtySystemPrompt('cardiometabolic')!;
    expect(prompt).toMatch(/ferritin/i);
  });
});

describe('core specialists — registry alignment', () => {
  it('the registry lists exactly four core specialties (general + 3 specialists)', () => {
    expect(listCoreSpecialties()).toHaveLength(4);
  });

  it('each of the three specialist keys maps to its specialty registry entry', () => {
    for (const key of ['cardiometabolic', 'sleep-recovery', 'hormonal-endocrine']) {
      const s = getSpecialty(key);
      expect(s).toBeDefined();
      expect(s?.status).toBe('core');
      expect(s?.safetyPolicyKey).toBe(key);
    }
  });
});
