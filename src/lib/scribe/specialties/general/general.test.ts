import { afterEach, describe, expect, it } from 'vitest';
import { GENERAL_POLICY } from '@/lib/scribe/policy/general';
import { getPolicy, listTopicPolicyKeys } from '@/lib/scribe/policy/registry';
import { getSpecialty } from '../registry';
import { clearSpecialtyPromptCache, loadSpecialtySystemPrompt } from '../load-prompt';

afterEach(() => {
  clearSpecialtyPromptCache();
});

describe('general specialty — policy + registry alignment', () => {
  it('GENERAL_POLICY is keyed `general` and registered in the topic-policy registry', () => {
    expect(GENERAL_POLICY.topicKey).toBe('general');
    const fromRegistry = getPolicy('general');
    expect(fromRegistry).toBe(GENERAL_POLICY);
    expect(listTopicPolicyKeys()).toContain('general');
  });

  it('allows all four judgment kinds (general scribe is a triage GP)', () => {
    expect(GENERAL_POLICY.allowedJudgmentKinds).toEqual([
      'reference-range-comparison',
      'pattern-vs-own-history',
      'citation-surfacing',
      'definition-lookup',
    ]);
  });

  it('forbidden-phrase patterns and citation density are non-empty', () => {
    expect(GENERAL_POLICY.forbiddenPhrasePatterns.length).toBeGreaterThan(0);
    expect(GENERAL_POLICY.minCitationDensityPerSection).toBeGreaterThan(0);
  });

  it('safetyPolicyKey on the general specialty matches the registered policy key', () => {
    const specialty = getSpecialty('general');
    expect(specialty?.safetyPolicyKey).toBe(GENERAL_POLICY.topicKey);
  });
});

describe('general specialty — system prompt loading', () => {
  it('loadSpecialtySystemPrompt(general) returns the markdown content', () => {
    const prompt = loadSpecialtySystemPrompt('general');
    expect(prompt).toBeDefined();
    expect(prompt).toMatch(/general care scribe/i);
    expect(prompt).toMatch(/refer_to_specialist/);
  });

  it('the prompt enumerates the three core specialists by name', () => {
    const prompt = loadSpecialtySystemPrompt('general')!;
    expect(prompt).toMatch(/Cardiometabolic/);
    expect(prompt).toMatch(/Sleep & recovery/);
    expect(prompt).toMatch(/Hormonal/);
  });

  it('the prompt enumerates at least five stub specialists', () => {
    const prompt = loadSpecialtySystemPrompt('general')!;
    const stubMatches = ['Mental health', 'Musculoskeletal', 'GI', 'Reproductive', 'Dermatology'];
    for (const stub of stubMatches) {
      expect(prompt).toContain(stub);
    }
  });

  it('returns undefined for stub specialties (no prompt yet)', () => {
    expect(loadSpecialtySystemPrompt('mental-health')).toBeUndefined();
  });

  it('returns undefined for unregistered keys', () => {
    expect(loadSpecialtySystemPrompt('not-a-key')).toBeUndefined();
  });

  it('caches the prompt across calls (same string instance)', () => {
    const a = loadSpecialtySystemPrompt('general');
    const b = loadSpecialtySystemPrompt('general');
    expect(a).toBe(b);
  });
});
