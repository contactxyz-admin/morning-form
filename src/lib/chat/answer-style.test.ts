import { describe, expect, it } from 'vitest';
import { ASK_ANSWER_STYLE_PROMPT, appendAskAnswerStylePrompt } from './answer-style';

describe('ASK_ANSWER_STYLE_PROMPT', () => {
  it('bans raw report-style Markdown artifacts', () => {
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/Do not use Markdown tables/i);
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/horizontal rules/i);
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/emoji decoration/i);
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/oversized heading stacks/i);
  });

  it('defines sparse-record answer behavior', () => {
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/no relevant data/i);
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/Checked:/);
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/Next:/);
  });

  it('preserves safety and citation discipline', () => {
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/grounded in graph tool results and citations/i);
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/no diagnosis/i);
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/no prescription/i);
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/no medication or dosage naming/i);
    expect(ASK_ANSWER_STYLE_PROMPT).toMatch(/no imperative treatment instructions/i);
  });
});

describe('appendAskAnswerStylePrompt', () => {
  it('appends the Ask style appendix without replacing the base system prompt', () => {
    const system = appendAskAnswerStylePrompt('Base specialist prompt.');

    expect(system).toContain('Base specialist prompt.');
    expect(system).toContain('Ask answer style contract:');
  });
});
