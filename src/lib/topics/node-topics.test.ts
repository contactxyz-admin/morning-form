import { describe, expect, it } from 'vitest';
import { findTopicsForNode, type NodeLike } from './node-topics';
import type { TopicConfig } from './types';

function config(
  topicKey: string,
  displayName: string,
  types: TopicConfig['relevantNodeTypes'],
  patterns: string[],
): TopicConfig {
  return {
    topicKey,
    displayName,
    relevantNodeTypes: types,
    canonicalKeyPatterns: patterns,
    depth: 2,
    hasEvidenceForCompile: () => true,
    // prompts is not read by findTopicsForNode; cast through to satisfy the type.
    prompts: {} as TopicConfig['prompts'],
  };
}

const IRON = config('iron', 'Iron', ['biomarker', 'symptom'], ['ferritin', 'haemoglobin']);
const SLEEP = config('sleep', 'Sleep', ['metric_window', 'symptom'], ['hrv', 'sleep_duration']);
const ENERGY = config(
  'energy',
  'Energy',
  ['biomarker', 'symptom', 'metric_window'],
  ['ferritin', 'fatigue', 'hrv'],
);

const CONFIGS: TopicConfig[] = [IRON, SLEEP, ENERGY];

describe('findTopicsForNode', () => {
  it('returns every topic whose type + canonical-key pattern matches', () => {
    const node: NodeLike = { type: 'biomarker', canonicalKey: 'ferritin' };
    const refs = findTopicsForNode(node, CONFIGS);
    expect(refs.map((r) => r.topicKey)).toEqual(['energy', 'iron']);
  });

  it('skips topics whose relevantNodeTypes exclude this node type', () => {
    const node: NodeLike = { type: 'metric_window', canonicalKey: 'hrv' };
    const refs = findTopicsForNode(node, CONFIGS);
    expect(refs.map((r) => r.topicKey)).toEqual(['energy', 'sleep']);
  });

  it('skips topics whose patterns do not match the canonical key', () => {
    const node: NodeLike = { type: 'biomarker', canonicalKey: 'creatinine' };
    const refs = findTopicsForNode(node, CONFIGS);
    expect(refs).toEqual([]);
  });

  it('matches case-insensitively on canonicalKey vs lowercased patterns', () => {
    const node: NodeLike = { type: 'biomarker', canonicalKey: 'Ferritin_Serum' };
    const refs = findTopicsForNode(node, CONFIGS);
    expect(refs.map((r) => r.topicKey).sort()).toEqual(['energy', 'iron']);
  });

  it('alphabetizes by displayName for a stable UI order', () => {
    const node: NodeLike = { type: 'biomarker', canonicalKey: 'ferritin' };
    const refs = findTopicsForNode(node, CONFIGS);
    expect(refs.map((r) => r.displayName)).toEqual(['Energy', 'Iron']);
  });
});
