/**
 * Topic registry — declarative per-topic configuration.
 *
 * Iron is the U9 pilot and is fully specified here. Sleep/recovery and
 * energy-fatigue have placeholder prompts (see their modules) but real
 * registry entries so the compile pipeline can be exercised end-to-end
 * for more than one topic today.
 *
 * `hasEvidenceForCompile` replaces the plan's "promotionThreshold" field.
 * Same intent — does the subgraph contain enough for a meaningful page —
 * expressed as a predicate over the fetched seed nodes so callers don't
 * need to know node-count vs biomarker-presence semantics.
 */
import type { GraphNodeRecord } from '@/lib/graph/types';
import type { TopicConfig } from './types';
import { IRON_PROMPT, IRON_TOPIC_KEY_VALUE } from './prompts/iron';
import { SLEEP_RECOVERY_PROMPT, SLEEP_RECOVERY_TOPIC_KEY } from './prompts/sleep-recovery';
import { ENERGY_FATIGUE_PROMPT, ENERGY_FATIGUE_TOPIC_KEY } from './prompts/energy-fatigue';

const IRON_CANONICAL_KEY_PATTERNS = [
  'ferritin',
  'haemoglobin',
  'hemoglobin',
  'transferrin_saturation',
  'mcv',
  'reticulocyte',
];

function hasIronEvidence(nodes: GraphNodeRecord[]): boolean {
  return nodes.some(
    (n) =>
      n.type === 'biomarker' &&
      IRON_CANONICAL_KEY_PATTERNS.some((p) => n.canonicalKey.toLowerCase().includes(p)),
  );
}

const IRON_CONFIG: TopicConfig = {
  topicKey: IRON_TOPIC_KEY_VALUE,
  displayName: 'Iron status',
  relevantNodeTypes: ['biomarker', 'symptom', 'condition', 'lifestyle', 'medication', 'intervention'],
  canonicalKeyPatterns: IRON_CANONICAL_KEY_PATTERNS,
  depth: 2,
  hasEvidenceForCompile: hasIronEvidence,
  prompts: IRON_PROMPT,
};

const SLEEP_RECOVERY_CONFIG: TopicConfig = {
  topicKey: SLEEP_RECOVERY_TOPIC_KEY,
  displayName: 'Sleep & recovery',
  relevantNodeTypes: ['metric_window', 'symptom', 'lifestyle', 'biomarker', 'condition'],
  canonicalKeyPatterns: ['hrv', 'rhr', 'sleep_stage', 'sleep_duration', 'sleep_onset', 'wake_events'],
  depth: 2,
  hasEvidenceForCompile: (nodes) =>
    nodes.some((n) => n.type === 'metric_window' || n.type === 'biomarker'),
  prompts: SLEEP_RECOVERY_PROMPT,
};

const ENERGY_FATIGUE_CONFIG: TopicConfig = {
  topicKey: ENERGY_FATIGUE_TOPIC_KEY,
  displayName: 'Energy & fatigue',
  relevantNodeTypes: [
    'biomarker',
    'symptom',
    'metric_window',
    'condition',
    'lifestyle',
    'mood',
    'energy',
    'medication',
  ],
  canonicalKeyPatterns: [
    'fatigue',
    'energy',
    'ferritin',
    'haemoglobin',
    'tsh',
    'hba1c',
    'mood',
    'hrv',
    'sleep_duration',
  ],
  depth: 3,
  hasEvidenceForCompile: (nodes) => nodes.length >= 2,
  prompts: ENERGY_FATIGUE_PROMPT,
};

const REGISTRY: ReadonlyMap<string, TopicConfig> = new Map([
  [IRON_CONFIG.topicKey, IRON_CONFIG],
  [SLEEP_RECOVERY_CONFIG.topicKey, SLEEP_RECOVERY_CONFIG],
  [ENERGY_FATIGUE_CONFIG.topicKey, ENERGY_FATIGUE_CONFIG],
]);

export function getTopicConfig(topicKey: string): TopicConfig | undefined {
  return REGISTRY.get(topicKey);
}

export function listTopicConfigs(): TopicConfig[] {
  return Array.from(REGISTRY.values());
}

export function listTopicKeys(): string[] {
  return Array.from(REGISTRY.keys());
}

export const TOPIC_KEYS = {
  iron: IRON_TOPIC_KEY_VALUE,
  sleepRecovery: SLEEP_RECOVERY_TOPIC_KEY,
  energyFatigue: ENERGY_FATIGUE_TOPIC_KEY,
} as const;
