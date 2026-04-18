import { IRON_POLICY } from './iron';
import { SLEEP_RECOVERY_POLICY } from './sleep-recovery';
import { ENERGY_FATIGUE_POLICY } from './energy-fatigue';
import type { SafetyPolicy } from './types';

const REGISTRY: ReadonlyMap<string, SafetyPolicy> = new Map([
  [IRON_POLICY.topicKey, IRON_POLICY],
  [SLEEP_RECOVERY_POLICY.topicKey, SLEEP_RECOVERY_POLICY],
  [ENERGY_FATIGUE_POLICY.topicKey, ENERGY_FATIGUE_POLICY],
]);

export function getPolicy(topicKey: string): SafetyPolicy | undefined {
  return REGISTRY.get(topicKey);
}

export function listTopicPolicyKeys(): string[] {
  return Array.from(REGISTRY.keys());
}
