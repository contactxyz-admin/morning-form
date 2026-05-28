/**
 * PR6 adversarial retrieval suite.
 *
 * The fixtures model clinically common near-misses: same biomarker family,
 * opposite interpretation. The invariant is narrow and important:
 * topic graph traversal may boost relevant query/vector hits, but with
 * requireQueryArmMatch=true it must not introduce graph-only contradictory
 * nodes into search_graph_nodes-style results.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hybridRetrieveNodes } from './hybrid-retrieval';

vi.mock('@/lib/embeddings/pipeline', () => ({
  embedQuery: vi.fn(),
}));

vi.mock('@/lib/embeddings/compat', () => ({
  getVectorSearchStrategy: vi.fn(() => 'js-cosine'),
  isPgvectorAvailable: vi.fn(() => true),
  isHybridRetrievalEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/topics/registry', () => ({
  getTopicConfig: vi.fn(() => ({
    topicKey: 'iron',
    relevantNodeTypes: ['biomarker', 'condition', 'symptom'],
    canonicalKeyPatterns: ['*'],
    depth: 2,
  })),
}));

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  return {
    ...actual,
    getSubgraphForTopic: vi.fn(),
    getProvenanceForNodes: vi.fn(),
    getRecentChunkVectors: vi.fn(),
    getNodeIdsForSupportChunks: vi.fn(),
    getAllNodesForUser: vi.fn(),
    getNodesByIds: vi.fn(),
  };
});

import { embedQuery } from '@/lib/embeddings/pipeline';
import {
  getAllNodesForUser,
  getNodeIdsForSupportChunks,
  getNodesByIds,
  getProvenanceForNodes,
  getRecentChunkVectors,
  getSubgraphForTopic,
} from './queries';

interface NearMissFixture {
  name: string;
  query: string;
  expected: string;
  contradictory: string;
  queryVector: number[];
  expectedVector: number[];
  contradictoryVector: number[];
}

const NEAR_MISS_FIXTURES: NearMissFixture[] = [
  {
    name: 'depleted iron stores vs normal ferritin',
    query: 'iron stores are depleted',
    expected: 'ferritin_low',
    contradictory: 'ferritin_normal',
    queryVector: [1, 0, 0],
    expectedVector: [0.98, 0.02, 0],
    contradictoryVector: [-0.8, 0.1, 0],
  },
  {
    name: 'anaemia signal vs normal haemoglobin',
    query: 'possible anaemia pattern',
    expected: 'haemoglobin_low',
    contradictory: 'haemoglobin_normal',
    queryVector: [0.9, 0.1, 0],
    expectedVector: [0.88, 0.12, 0],
    contradictoryVector: [-0.7, 0.1, 0],
  },
  {
    name: 'inflammation raised vs normal CRP',
    query: 'inflammatory marker raised',
    expected: 'crp_high',
    contradictory: 'crp_normal',
    queryVector: [0.8, 0.2, 0],
    expectedVector: [0.82, 0.18, 0],
    contradictoryVector: [-0.2, 0.8, 0],
  },
  {
    name: 'thyroid underactive vs suppressed TSH',
    query: 'underactive thyroid signal',
    expected: 'tsh_high',
    contradictory: 'tsh_low',
    queryVector: [0.7, 0.3, 0],
    expectedVector: [0.72, 0.28, 0],
    contradictoryVector: [-0.1, -0.9, 0],
  },
  {
    name: 'vitamin D deficiency vs sufficient stores',
    query: 'low sunshine vitamin stores',
    expected: 'vitamin_d_low',
    contradictory: 'vitamin_d_sufficient',
    queryVector: [0.6, 0.4, 0],
    expectedVector: [0.64, 0.36, 0],
    contradictoryVector: [-0.6, 0.2, 0],
  },
  {
    name: 'raised LDL risk vs protective HDL context',
    query: 'atherogenic cholesterol raised',
    expected: 'ldl_high',
    contradictory: 'hdl_high',
    queryVector: [0.55, 0.45, 0],
    expectedVector: [0.58, 0.42, 0],
    contradictoryVector: [0.05, -0.95, 0],
  },
  {
    name: 'long-term glucose elevated vs normal fasting glucose',
    query: 'three month glucose running high',
    expected: 'hba1c_high',
    contradictory: 'fasting_glucose_normal',
    queryVector: [0.5, 0.5, 0],
    expectedVector: [0.52, 0.48, 0],
    contradictoryVector: [-0.5, 0, 0],
  },
  {
    name: 'low neutrophils vs high neutrophils',
    query: 'white cell subtype below range',
    expected: 'neutrophils_low',
    contradictory: 'neutrophils_high',
    queryVector: [0.45, 0.55, 0],
    expectedVector: [0.47, 0.53, 0],
    contradictoryVector: [-0.45, -0.55, 0],
  },
  {
    name: 'liver enzyme raised vs normal ALT',
    query: 'liver enzyme above range',
    expected: 'alt_high',
    contradictory: 'alt_normal',
    queryVector: [0.35, 0.65, 0],
    expectedVector: [0.38, 0.62, 0],
    contradictoryVector: [-0.2, -0.8, 0],
  },
  {
    name: 'kidney filtration reduced vs normal eGFR',
    query: 'kidney filtration reduced',
    expected: 'egfr_low',
    contradictory: 'egfr_normal',
    queryVector: [0.25, 0.75, 0],
    expectedVector: [0.28, 0.72, 0],
    contradictoryVector: [0.9, -0.5, 0],
  },
  {
    name: 'B12 deficiency vs high B12',
    query: 'methylation vitamin deficient',
    expected: 'b12_low',
    contradictory: 'b12_high',
    queryVector: [0.15, 0.85, 0],
    expectedVector: [0.17, 0.83, 0],
    contradictoryVector: [-0.9, 0, 0],
  },
  {
    name: 'morning cortisol low vs high cortisol',
    query: 'morning stress hormone low',
    expected: 'cortisol_low',
    contradictory: 'cortisol_high',
    queryVector: [0.1, 0.9, 0],
    expectedVector: [0.12, 0.88, 0],
    contradictoryVector: [0, -1, 0],
  },
];

describe('hybridRetrieveNodes adversarial near-miss cases', () => {
  const mockDb = {} as any;
  const userId = 'user_adversarial';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAllNodesForUser).mockResolvedValue([]);
  });

  it.each(NEAR_MISS_FIXTURES)(
    'retrieves the grounded match and excludes the contradictory graph-only node: $name',
    async (fixture) => {
      const expectedNode = {
        id: `node_${fixture.expected}`,
        type: 'biomarker',
        canonicalKey: fixture.expected,
        displayName: fixture.expected.replaceAll('_', ' '),
      };
      const contradictoryNode = {
        id: `node_${fixture.contradictory}`,
        type: 'biomarker',
        canonicalKey: fixture.contradictory,
        displayName: fixture.contradictory.replaceAll('_', ' '),
      };
      const graphOnlyDistractor = {
        id: `node_graph_${fixture.expected}`,
        type: 'biomarker',
        canonicalKey: `${fixture.expected}_historical`,
        displayName: `${fixture.expected} historical context`,
      };
      const allNodes = [expectedNode, contradictoryNode, graphOnlyDistractor];

      vi.mocked(embedQuery).mockResolvedValue(fixture.queryVector);
      vi.mocked(getRecentChunkVectors).mockResolvedValue([
        { chunkId: `chunk_${fixture.expected}`, vector: fixture.expectedVector },
        { chunkId: `chunk_${fixture.contradictory}`, vector: fixture.contradictoryVector },
      ]);
      vi.mocked(getNodeIdsForSupportChunks).mockResolvedValue(
        new Map([
          [`chunk_${fixture.expected}`, [expectedNode.id]],
          [`chunk_${fixture.contradictory}`, [contradictoryNode.id]],
        ]),
      );
      vi.mocked(getSubgraphForTopic).mockResolvedValue({
        nodes: allNodes as any,
        edges: [],
      });
      vi.mocked(getNodesByIds).mockImplementation(async (_db, ids: string[]) =>
        allNodes.filter((node) => ids.includes(node.id)) as any,
      );
      vi.mocked(getProvenanceForNodes).mockResolvedValue(
        new Map([
          [
            expectedNode.id,
            [
              {
                chunkId: `chunk_${fixture.expected}`,
                documentId: `doc_${fixture.expected}`,
                text: `${fixture.expected} source text`,
              } as any,
            ],
          ],
        ]),
      );

      const results = await hybridRetrieveNodes(mockDb, userId, fixture.query, {
        topicKey: 'iron',
        requireQueryArmMatch: true,
        limit: 5,
      });

      const ids = results.map((result) => result.node.id);
      expect(ids).toContain(expectedNode.id);
      expect(ids).not.toContain(contradictoryNode.id);
      expect(ids).not.toContain(graphOnlyDistractor.id);
      expect(
        results.find((result) => result.node.id === expectedNode.id)?.sources,
      ).toHaveLength(1);
    },
  );
});
