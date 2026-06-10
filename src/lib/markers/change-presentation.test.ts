import { describe, expect, it } from 'vitest';
import {
  CHANGE_CLASSIFICATION_LABEL,
  changeClassificationLabel,
  changeDirectionGlyph,
} from './change-presentation';

describe('changeDirectionGlyph', () => {
  it('maps directions to arrows and `new` (null) to plus', () => {
    expect(changeDirectionGlyph('up')).toBe('↑');
    expect(changeDirectionGlyph('down')).toBe('↓');
    expect(changeDirectionGlyph('flat')).toBe('→');
    expect(changeDirectionGlyph(null)).toBe('+');
  });
});

describe('changeClassificationLabel', () => {
  it('labels every classification', () => {
    expect(changeClassificationLabel('improved')).toBe('Toward range');
    expect(changeClassificationLabel('worsened')).toBe('Away from range');
    expect(changeClassificationLabel('stable')).toBe('In range');
    expect(changeClassificationLabel('new')).toBe('New reading');
    expect(changeClassificationLabel('unclassified')).toBe('Changed');
  });

  it('defaults an unknown classification to "Changed"', () => {
    expect(changeClassificationLabel('wat')).toBe('Changed');
  });

  it('the label map is total over the classification union', () => {
    expect(Object.keys(CHANGE_CLASSIFICATION_LABEL).sort()).toEqual(
      ['improved', 'new', 'stable', 'unclassified', 'worsened'],
    );
  });
});
