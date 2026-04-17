import { describe, expect, it } from 'vitest';
import { redactSubgraph, redactTopicOutput } from './redact';
import { TopicCompiledOutputSchema, type TopicCompiledOutput } from '@/lib/topics/types';
import type { GraphEdgeRecord, GraphNodeRecord } from '@/lib/graph/types';

function sampleOutput(): TopicCompiledOutput {
  return {
    understanding: {
      heading: 'Iron status',
      bodyMarkdown: 'Your ferritin is 18 ng/mL and Hb 11.5 g/dL.',
      citations: [
        { nodeId: 'n-ferritin', excerpt: 'Ferritin 18 ng/mL' },
        { nodeId: 'n-haemoglobin', excerpt: 'Hb 11.5 g/dL' },
      ],
    },
    whatYouCanDoNow: {
      heading: 'Next steps',
      bodyMarkdown: '- Pair iron bisglycinate 25mg with vitamin C.',
      citations: [{ nodeId: 'n-iron-supp', excerpt: 'Iron bisglycinate 25mg' }],
    },
    discussWithClinician: {
      heading: 'Bring to your GP',
      bodyMarkdown: 'Ask about tolerance at ferritin 18 ng/mL.',
      citations: [{ nodeId: 'n-ferritin', excerpt: 'Ferritin 18 ng/mL' }],
    },
    gpPrep: {
      questionsToAsk: ['What ferritin level should we target?'],
      relevantHistory: ['Low iron flagged on last panel'],
      testsToConsiderRequesting: ['Ferritin repeat in 8 weeks'],
      printableMarkdown: '# GP prep\nFerritin 18 ng/mL. Ask about iron.',
    },
  };
}

describe('redactTopicOutput', () => {
  it('is a no-op when no node ids are hidden', () => {
    const original = sampleOutput();
    const { output, hadRedactions, affectedSections } = redactTopicOutput(original, {});
    expect(hadRedactions).toBe(false);
    expect(affectedSections).toEqual([]);
    expect(output.understanding.citations).toHaveLength(2);
    expect(output.gpPrep).toEqual(original.gpPrep);
  });

  it('replaces bodyMarkdown on partial citation removal (prose may still reference hidden data)', () => {
    const { output, hadRedactions, affectedSections } = redactTopicOutput(sampleOutput(), {
      hideNodeIds: ['n-haemoglobin'],
    });
    expect(hadRedactions).toBe(true);
    expect(affectedSections).toEqual(['understanding']);
    // Surviving citation is preserved so the reader can still navigate.
    expect(output.understanding.citations).toEqual([
      { nodeId: 'n-ferritin', excerpt: 'Ferritin 18 ng/mL' },
    ]);
    // Body is scrubbed — the original prose mentioned Hb 11.5.
    expect(output.understanding.bodyMarkdown).toContain('hidden from this shared view');
    expect(output.understanding.bodyMarkdown).not.toContain('Hb');
    expect(output.understanding.bodyMarkdown).not.toContain('11.5');
  });

  it('replaces body + stamps a placeholder citation when all citations are hidden', () => {
    const { output, hadRedactions, affectedSections } = redactTopicOutput(sampleOutput(), {
      hideNodeIds: ['n-iron-supp'],
    });
    expect(hadRedactions).toBe(true);
    expect(affectedSections).toContain('whatYouCanDoNow');
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
    expect(output.understanding.bodyMarkdown).toContain('hidden from this shared view');
    expect(output.discussWithClinician.bodyMarkdown).toContain('hidden from this shared view');
  });

  it('scrubs gpPrep wholesale whenever any node is hidden', () => {
    const { output, hadRedactions } = redactTopicOutput(sampleOutput(), {
      hideNodeIds: ['n-haemoglobin'],
    });
    expect(hadRedactions).toBe(true);
    // None of the original prose should survive in gpPrep.
    expect(output.gpPrep.questionsToAsk).not.toContain('What ferritin level should we target?');
    expect(output.gpPrep.relevantHistory).toEqual([]);
    expect(output.gpPrep.testsToConsiderRequesting).toEqual([]);
    expect(output.gpPrep.printableMarkdown).not.toContain('Ferritin 18 ng/mL');
    expect(output.gpPrep.printableMarkdown).toContain('hidden from this shared view');
  });

  it('flags hadRedactions even when no citation matches — gpPrep is still scrubbed', () => {
    const { output, hadRedactions, affectedSections } = redactTopicOutput(sampleOutput(), {
      hideNodeIds: ['n-does-not-match-anything'],
    });
    expect(hadRedactions).toBe(true);
    expect(affectedSections).toEqual([]);
    expect(output.gpPrep.printableMarkdown).toContain('hidden from this shared view');
  });

  it('redacted output still validates against TopicCompiledOutputSchema', () => {
    const { output } = redactTopicOutput(sampleOutput(), {
      hideNodeIds: ['n-haemoglobin', 'n-ferritin', 'n-iron-supp'],
    });
    const parsed = TopicCompiledOutputSchema.safeParse(output);
    expect(parsed.success).toBe(true);
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
