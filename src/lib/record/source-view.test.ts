import { describe, expect, it } from 'vitest';
import { buildSourceView, kindLabel } from './source-view';
import type { SourceViewInput } from './source-view';

function baseInput(overrides: Partial<SourceViewInput> = {}): SourceViewInput {
  return {
    id: 'src-1',
    kind: 'lab_pdf',
    sourceRef: null,
    capturedAt: new Date('2026-03-10T09:00:00Z'),
    createdAt: new Date('2026-03-10T09:00:05Z'),
    chunks: [],
    edges: [],
    nodes: [],
    ...overrides,
  };
}

describe('kindLabel', () => {
  it('maps known kinds to human labels', () => {
    expect(kindLabel('lab_pdf')).toBe('Lab report');
    expect(kindLabel('intake_text')).toBe('Intake notes');
  });

  it('falls back to spaced kind for unknown values', () => {
    expect(kindLabel('custom_upload')).toBe('custom upload');
  });
});

describe('buildSourceView', () => {
  it('prefers sourceRef as the display title when present', () => {
    const out = buildSourceView(baseInput({ sourceRef: '2026-lab-full-panel.pdf' }));
    expect(out.displayTitle).toBe('2026-lab-full-panel.pdf');
  });

  it('falls back to kindLabel + captured date when sourceRef is blank', () => {
    const out = buildSourceView(baseInput({ sourceRef: null }));
    expect(out.displayTitle).toMatch(/^Lab report —/);
    expect(out.kindLabel).toBe('Lab report');
  });

  it('orders chunks by index', () => {
    const out = buildSourceView(
      baseInput({
        chunks: [
          { id: 'c3', index: 3, text: 'third', pageNumber: 1 },
          { id: 'c1', index: 1, text: 'first', pageNumber: 1 },
          { id: 'c2', index: 2, text: 'second', pageNumber: 1 },
        ],
      }),
    );
    expect(out.chunks.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('collects unique referenced nodes sorted by displayName', () => {
    const out = buildSourceView(
      baseInput({
        edges: [
          { toNodeId: 'n2' },
          { toNodeId: 'n1' },
          { toNodeId: 'n2' }, // duplicate edge → still one node
          { toNodeId: 'missing' }, // unresolvable → skipped
        ],
        nodes: [
          { id: 'n1', type: 'biomarker', displayName: 'Ferritin', canonicalKey: 'ferritin' },
          { id: 'n2', type: 'biomarker', displayName: 'Haemoglobin', canonicalKey: 'haemoglobin' },
        ],
      }),
    );
    expect(out.referencedNodes.map((n) => n.displayName)).toEqual(['Ferritin', 'Haemoglobin']);
  });

  it('ISO-serializes the date fields', () => {
    const out = buildSourceView(baseInput());
    expect(out.capturedAt).toBe('2026-03-10T09:00:00.000Z');
    expect(out.createdAt).toBe('2026-03-10T09:00:05.000Z');
  });
});
