import { describe, expect, it } from 'vitest';
import { redactSubgraph, redactTopicOutput } from './redact';
import type { TopicCompiledOutput } from '@/lib/topics/types';
import type { GraphEdgeRecord, GraphNodeRecord } from '@/lib/graph/types';

function sampleOutput(): TopicCompiledOutput {
  return {
    understanding: {
      heading: 'Iron status',
      bodyMarkdown: 'Your ferritin is low.',
      citations: [
        { nodeId: 'n-ferritin', excerpt: 'Ferritin 18 ng/mL' },
        { nodeId: 'n-haemoglobin', excerpt: 'Hb 11.5 g/dL' },
      ],
    },
    whatYouCanDoNow: {
      heading: 'Next steps',
      bodyMarkdown: '- Pair iron with vitamin C.',
      citations: [{ nodeId: 'n-iron-supp', excerpt: 'Iron bisglycinate 25mg' }],
    },
    discussWithClinician: {
      heading: 'Bring to your GP',
      bodyMarkdown: 'Ask about tolerance.',
      citations: [{ nodeId: 'n-ferritin', excerpt: 'Ferritin 18 ng/mL' }],
    },
    gpPrep: {
      questionsToAsk: ['What level should we target?'],
      relevantHistory: [],
      testsToConsiderRequesting: ['Ferritin repeat in 8 weeks'],
      printableMarkdown: '# GP prep\n...',
    },
  };
}

describe('redactTopicOutput', () => {
  it('is a no-op when no node ids are hidden', () => {
    const { output, hadRedactions, affectedSections } = redactTopicOutput(sampleOutput(), {});
    expect(hadRedactions).toBe(false);
    expect(affectedSections).toEqual([]);
    expect(output.understanding.citations).toHaveLength(2);
  });

  it('removes citations for hidden node ids', () => {
    const { output, hadRedactions, affectedSections } = redactTopicOutput(sampleOutput(), {
      hideNodeIds: ['n-haemoglobin'],
    });
    expect(hadRedactions).toBe(true);
    expect(affectedSections).toEqual(['understanding']);
    expect(output.understanding.citations).toEqual([
      { nodeId: 'n-ferritin', excerpt: 'Ferritin 18 ng/mL' },
    ]);
  });

  it('replaces body + stamps a placeholder citation when all citations are hidden', () => {
    const { output, hadRedactions, affectedSections } = redactTopicOutput(sampleOutput(), {
      hideNodeIds: ['n-iron-supp'],
    });
    expect(hadRedactions).toBe(true);
    expect(affectedSections).toEqual(['whatYouCanDoNow']);
    expect(output.whatYouCanDoNow.bodyMarkdown).toContain('hidden from this shared view');
    expect(output.whatYouCanDoNow.citations).toEqual([
      { nodeId: '__redacted__', excerpt: 'Redacted for this share.' },
    ]);
  });

  it('respects multiple hidden nodes across sections', () => {
    const { affectedSections, output } = redactTopicOutput(sampleOutput(), {
      hideNodeIds: ['n-haemoglobin', 'n-ferritin'],
    });
    expect(affectedSections).toEqual(['understanding', 'discussWithClinician']);
    expect(output.understanding.citations[0].nodeId).toBe('__redacted__');
    expect(output.discussWithClinician.citations[0].nodeId).toBe('__redacted__');
  });
});

describe('redactSubgraph', () => {
  const nodes: GraphNodeRecord[] = [
    {
      id: 'a',
      userId: 'u',
      type: 'biomarker',
      canonicalKey: 'a',
      displayName: 'A',
      attributes: {},
      confidence: 1,
      promoted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'b',
      userId: 'u',
      type: 'biomarker',
      canonicalKey: 'b',
      displayName: 'B',
      attributes: {},
      confidence: 1,
      promoted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const edges: GraphEdgeRecord[] = [
    {
      id: 'e1',
      userId: 'u',
      type: 'ASSOCIATED_WITH',
      fromNodeId: 'a',
      toNodeId: 'b',
      fromChunkId: null,
      fromDocumentId: null,
      weight: 1,
      metadata: {},
      createdAt: new Date(),
    },
  ];

  it('strips hidden nodes and their incident edges', () => {
    const result = redactSubgraph({ nodes, edges }, { hideNodeIds: ['b'] });
    expect(result.nodes.map((n) => n.id)).toEqual(['a']);
    expect(result.edges).toHaveLength(0);
  });

  it('leaves unrelated nodes and edges intact', () => {
    const result = redactSubgraph({ nodes, edges }, { hideNodeIds: ['unknown'] });
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });
});
