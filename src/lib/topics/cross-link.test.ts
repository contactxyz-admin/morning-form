import { describe, expect, it } from 'vitest';
import { buildInlineSpans } from './cross-link';
import type { Citation } from './types';

function cite(nodeId: string, excerpt: string): Citation {
  return { nodeId, excerpt };
}

describe('buildInlineSpans', () => {
  it('returns a single text span when there are no citations', () => {
    const spans = buildInlineSpans('Ferritin is low.', []);
    expect(spans).toEqual([{ kind: 'text', content: 'Ferritin is low.' }]);
  });

  it('wraps the first occurrence of a matching excerpt', () => {
    const spans = buildInlineSpans('Your ferritin is low — iron stores are depleted.', [
      cite('n-ferritin', 'ferritin'),
    ]);
    expect(spans).toEqual([
      { kind: 'text', content: 'Your ' },
      { kind: 'node-link', content: 'ferritin', nodeId: 'n-ferritin' },
      { kind: 'text', content: ' is low — iron stores are depleted.' },
    ]);
  });

  it('links each distinct excerpt exactly once', () => {
    const spans = buildInlineSpans(
      'ferritin is low. Your ferritin is very low. Haemoglobin is normal.',
      [cite('n-ferritin', 'ferritin'), cite('n-hb', 'Haemoglobin')],
    );
    const linked = spans.filter((s) => s.kind === 'node-link');
    expect(linked.map((s) => ({ nodeId: s.nodeId, content: s.content }))).toEqual([
      { nodeId: 'n-ferritin', content: 'ferritin' },
      { nodeId: 'n-hb', content: 'Haemoglobin' },
    ]);
  });

  it('falls back to plain prose when no excerpt can be found verbatim', () => {
    const spans = buildInlineSpans('Your iron stores are depleted.', [
      cite('n-ferritin', 'ferritin level below 30 ng/mL'),
    ]);
    expect(spans).toEqual([{ kind: 'text', content: 'Your iron stores are depleted.' }]);
  });

  it('dedupes citations that repeat the same excerpt string', () => {
    const spans = buildInlineSpans('Ferritin and more ferritin.', [
      cite('n-a', 'ferritin'),
      cite('n-b', 'ferritin'),
    ]);
    const linked = spans.filter((s) => s.kind === 'node-link');
    expect(linked).toHaveLength(1);
    expect(linked[0].nodeId).toBe('n-a');
  });

  it('picks the earliest match and skips overlapping later ones', () => {
    const spans = buildInlineSpans('low ferritin reading', [
      cite('n-ferritin', 'low ferritin'),
      cite('n-reading', 'ferritin reading'),
    ]);
    const linked = spans.filter((s) => s.kind === 'node-link');
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ content: 'low ferritin', nodeId: 'n-ferritin' });
  });

  it('handles multi-paragraph bodies without crossing paragraph boundaries unintentionally', () => {
    const body = 'Haemoglobin is in range.\n\nFerritin is low.';
    const spans = buildInlineSpans(body, [
      cite('n-hb', 'Haemoglobin'),
      cite('n-ferritin', 'Ferritin'),
    ]);
    const textContent = spans.map((s) => s.content).join('');
    expect(textContent).toBe(body);
    expect(spans.filter((s) => s.kind === 'node-link')).toHaveLength(2);
  });
});
