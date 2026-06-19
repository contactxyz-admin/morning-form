import { afterEach, describe, expect, it } from 'vitest';
import { CARDIOMETABOLIC_POLICY } from '@/lib/scribe/policy/cardiometabolic';
import { HORMONAL_ENDOCRINE_POLICY } from '@/lib/scribe/policy/hormonal-endocrine';
import { SLEEP_RECOVERY_POLICY } from '@/lib/scribe/policy/sleep-recovery';
import { MEDICATION_SUPPLEMENT_POLICY } from '@/lib/scribe/policy/medication-supplement';
import { getPolicy, listTopicPolicyKeys } from '@/lib/scribe/policy/registry';
import { ASK_ANSWER_STYLE_PROMPT } from '@/lib/chat/answer-style';
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
  it('cardiometabolic allows the five judgment kinds (broad metabolic remit incl. investigations)', () => {
    expect(CARDIOMETABOLIC_POLICY.allowedJudgmentKinds).toEqual([
      'reference-range-comparison',
      'pattern-vs-own-history',
      'citation-surfacing',
      'definition-lookup',
      'investigation-avenues',
    ]);
  });

  it('hormonal-endocrine allows the five judgment kinds (definition lookup is core, incl. investigations)', () => {
    expect(HORMONAL_ENDOCRINE_POLICY.allowedJudgmentKinds).toEqual([
      'reference-range-comparison',
      'pattern-vs-own-history',
      'citation-surfacing',
      'definition-lookup',
      'investigation-avenues',
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

  it('keeps Ask answer formatting as a separate runtime appendix', () => {
    for (const specialty of listCoreSpecialties()) {
      const prompt = loadSpecialtySystemPrompt(specialty.key)!;
      expect(prompt).not.toContain('Ask answer style contract:');
    }
    expect(ASK_ANSWER_STYLE_PROMPT).toContain('Ask answer style contract:');
  });
});

describe('sleep-recovery — Tier 1 risk-free guidance discipline (Plan 2026-06-19-001 Unit 1)', () => {
  const sleepPrompt = () => loadSpecialtySystemPrompt('sleep-recovery')!;

  it('instructs the specialist to lead with risk-free guidance before track/measure/discuss', () => {
    const prompt = sleepPrompt();
    expect(prompt).toMatch(/lead with[^.]*risk-free|risk-free guidance first/i);
    expect(prompt).toMatch(/before any[^.]*track/i);
  });

  it('carries the concrete sleep-hygiene canon the user can act on (incl. ~18 °C bedroom)', () => {
    const prompt = sleepPrompt();
    expect(prompt).toMatch(/consistent sleep and wake time/i);
    expect(prompt).toMatch(/18\s*°C/);
    expect(prompt).toMatch(/caffeine cut-off/i);
  });

  it('surfaces hygiene as user-owned `behavior` next-steps, not a clinician punt', () => {
    const prompt = sleepPrompt();
    expect(prompt).toMatch(/user-owned/i);
    expect(prompt).toContain('behavior');
  });

  it('routes the supplement/medication part to a clinician instead of going silent', () => {
    const prompt = sleepPrompt();
    expect(prompt).toMatch(/never name medications, supplements, or dosages/i);
    expect(prompt).toMatch(/clinician/i);
    expect(prompt).toContain('route_to_gp_prep');
    expect(prompt).toMatch(/rather than going silent|never a dead end/i);
  });
});

describe('medication & supplement review specialist (Plan 2026-06-19-001 Unit 3)', () => {
  it('is registered as a core specialty with a policy + prompt', () => {
    const s = getSpecialty('medication-supplement');
    expect(s?.status).toBe('core');
    expect(s?.safetyPolicyKey).toBe('medication-supplement');
    expect(getPolicy('medication-supplement')).toBe(MEDICATION_SUPPLEMENT_POLICY);
    expect(listTopicPolicyKeys()).toContain('medication-supplement');
  });

  it('is bounded to a discuss-only judgment set + a clinician handoff route', () => {
    expect(MEDICATION_SUPPLEMENT_POLICY.allowedJudgmentKinds).toEqual([
      'citation-surfacing',
      'investigation-avenues',
    ]);
    // NOT allowed to make a call on the member's own values.
    expect(MEDICATION_SUPPLEMENT_POLICY.allowedJudgmentKinds).not.toContain('reference-range-comparison');
    expect(MEDICATION_SUPPLEMENT_POLICY.allowedJudgmentKinds).not.toContain('pattern-vs-own-history');
    expect(MEDICATION_SUPPLEMENT_POLICY.outOfScopeRoute).toBe('discussWithClinician');
  });

  it('shares the global forbidden-phrase set (drug/dose/directive backstop)', () => {
    expect(MEDICATION_SUPPLEMENT_POLICY.forbiddenPhrasePatterns).toBe(
      SLEEP_RECOVERY_POLICY.forbiddenPhrasePatterns,
    );
  });

  it('its prompt forbids recommending and hands off to a clinician (never a recommendation)', () => {
    const prompt = loadSpecialtySystemPrompt('medication-supplement')!;
    expect(prompt).toMatch(/medication & supplement review specialist/i);
    expect(prompt).toMatch(/never recommend/i);
    expect(prompt).toContain('route_to_gp_prep');
    expect(prompt).toMatch(/not a recommender|clinician-prep/i);
  });
});

describe('core specialists — registry alignment', () => {
  it('the registry lists exactly five core specialties (general + 4 specialists)', () => {
    expect(listCoreSpecialties()).toHaveLength(5);
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
