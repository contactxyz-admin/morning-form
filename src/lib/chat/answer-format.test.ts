import { describe, expect, it } from 'vitest';
import { parseChatAnswer } from './answer-format';

describe('parseChatAnswer', () => {
  it('parses a simple Ask-style answer into headings, prose, bullets, and next steps', () => {
    const blocks = parseChatAnswer(
      [
        'Your ferritin looks low relative to the reference range in your latest result.',
        '',
        'What I see:',
        '- Ferritin: below range',
        '- Haemoglobin: in range',
        '',
        'Next:',
        '1. Bring the result to your next GP appointment.',
        '2. Add any newer iron panel if you have one.',
      ].join('\n'),
    );

    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        text: 'Your ferritin looks low relative to the reference range in your latest result.',
      },
      { kind: 'heading', text: 'What I see' },
      {
        kind: 'checkList',
        items: [
          { label: 'Ferritin', detail: 'below range', tone: 'caution' },
          { label: 'Haemoglobin', detail: 'in range', tone: 'found' },
        ],
      },
      { kind: 'heading', text: 'Next' },
      {
        kind: 'orderedList',
        items: [
          'Bring the result to your next GP appointment.',
          'Add any newer iron panel if you have one.',
        ],
      },
    ]);
  });

  it('turns legacy Markdown tables into checklist rows rather than raw pipe syntax', () => {
    const blocks = parseChatAnswer(
      [
        "I've done a thorough search across your iron topic and here's what I found:",
        '---',
        '### What Your Record Shows',
        '**No iron-related data has been captured yet.**',
        '',
        '| What I Checked | Result |',
        '|---|---|',
        '| Graph nodes | No entries found |',
        '| Reference range comparisons | No values on record |',
      ].join('\n'),
    );

    expect(blocks).toEqual([
      { kind: 'heading', text: 'What Your Record Shows' },
      { kind: 'paragraph', text: 'No iron-related data has been captured yet.' },
      {
        kind: 'checkList',
        items: [
          { label: 'Graph nodes', detail: 'No entries found', tone: 'missing' },
          {
            label: 'Reference range comparisons',
            detail: 'No values on record',
            tone: 'missing',
          },
        ],
      },
    ]);
  });

  it('parses sparse-record bullets as missing-data rows', () => {
    const blocks = parseChatAnswer(
      [
        "I don't have iron results in your record yet.",
        '',
        'Checked:',
        '- Ferritin: not found',
        '- Serum iron: missing',
        '- Haemoglobin: no data',
      ].join('\n'),
    );

    expect(blocks.at(-1)).toEqual({
      kind: 'checkList',
      items: [
        { label: 'Ferritin', detail: 'not found', tone: 'missing' },
        { label: 'Serum iron', detail: 'missing', tone: 'missing' },
        { label: 'Haemoglobin', detail: 'no data', tone: 'missing' },
      ],
    });
  });

  it('falls back to a single prose block for unrecognised text', () => {
    expect(parseChatAnswer('A plain answer with no special formatting.')).toEqual([
      { kind: 'paragraph', text: 'A plain answer with no special formatting.' },
    ]);
  });

  it('removes leading emoji decoration without stripping clinical symbols', () => {
    expect(parseChatAnswer('📋 What Your Record Shows:')[0]).toEqual({
      kind: 'heading',
      text: 'What Your Record Shows',
    });
    expect(parseChatAnswer('β-hCG is not in this record yet.')[0]).toEqual({
      kind: 'paragraph',
      text: 'β-hCG is not in this record yet.',
    });
  });

  it('does not throw on empty input', () => {
    expect(parseChatAnswer('')).toEqual([]);
  });
});
