import { describe, expect, it } from 'vitest';
import type { GraphNodeRecord } from '@/lib/graph/types';
import { getTopicConfig, listTopicKeys, TOPIC_KEYS } from './registry';

function biomarker(canonicalKey: string, displayName = canonicalKey): GraphNodeRecord {
  return {
    id: `node-${canonicalKey}`,
    userId: 'test-user',
    type: 'biomarker',
    canonicalKey,
    displayName,
    attributes: {},
    confidence: 1,
    promoted: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('topic registry', () => {
  it('registers iron, sleep-recovery, energy-fatigue', () => {
    const keys = listTopicKeys();
    expect(keys).toContain(TOPIC_KEYS.iron);
    expect(keys).toContain(TOPIC_KEYS.sleepRecovery);
    expect(keys).toContain(TOPIC_KEYS.energyFatigue);
  });

  it('returns undefined for unknown topic keys', () => {
    expect(getTopicConfig('not-real')).toBeUndefined();
  });

  it('iron config includes ferritin + haemoglobin canonical-key patterns', () => {
    const iron = getTopicConfig(TOPIC_KEYS.iron)!;
    expect(iron.canonicalKeyPatterns).toContain('ferritin');
    expect(iron.canonicalKeyPatterns).toContain('haemoglobin');
    expect(iron.canonicalKeyPatterns).toContain('hemoglobin');
  });

  it('iron config hasEvidenceForCompile fires on ferritin presence', () => {
    const iron = getTopicConfig(TOPIC_KEYS.iron)!;
    expect(iron.hasEvidenceForCompile([biomarker('ferritin')])).toBe(true);
    expect(iron.hasEvidenceForCompile([biomarker('haemoglobin')])).toBe(true);
    expect(iron.hasEvidenceForCompile([])).toBe(false);
    expect(iron.hasEvidenceForCompile([biomarker('unrelated_marker')])).toBe(false);
  });

  it('energy-fatigue config widens depth to 3', () => {
    const energy = getTopicConfig(TOPIC_KEYS.energyFatigue)!;
    expect(energy.depth).toBe(3);
  });
});
