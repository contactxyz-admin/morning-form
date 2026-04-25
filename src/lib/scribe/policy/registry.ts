import { IRON_POLICY } from './iron';
import { SLEEP_RECOVERY_POLICY } from './sleep-recovery';
import { ENERGY_FATIGUE_POLICY } from './energy-fatigue';
import { GENERAL_POLICY } from './general';
import { CARDIOMETABOLIC_POLICY } from './cardiometabolic';
import { HORMONAL_ENDOCRINE_POLICY } from './hormonal-endocrine';
import type { SafetyPolicy } from './types';

const REGISTRY: ReadonlyMap<string, SafetyPolicy> = new Map([
  [GENERAL_POLICY.topicKey, GENERAL_POLICY],
  [CARDIOMETABOLIC_POLICY.topicKey, CARDIOMETABOLIC_POLICY],
  [SLEEP_RECOVERY_POLICY.topicKey, SLEEP_RECOVERY_POLICY],
  [HORMONAL_ENDOCRINE_POLICY.topicKey, HORMONAL_ENDOCRINE_POLICY],
  [IRON_POLICY.topicKey, IRON_POLICY],
  [ENERGY_FATIGUE_POLICY.topicKey, ENERGY_FATIGUE_POLICY],
]);

export function getPolicy(topicKey: string): SafetyPolicy | undefined {
  return REGISTRY.get(topicKey);
}

export function listTopicPolicyKeys(): string[] {
  return Array.from(REGISTRY.keys());
}
