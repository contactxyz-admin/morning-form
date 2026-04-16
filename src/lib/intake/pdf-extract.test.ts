import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock pdf-parse so we can drive extractPdfText with controlled page text
// without constructing a valid PDF binary in the test.
const mockGetText = vi.fn();
const mockDestroy = vi.fn().mockResolvedValue(undefined);

vi.mock('pdf-parse', () => ({
  // Regular function (not arrow) so `new PDFParse(...)` actually constructs.
  PDFParse: vi.fn().mockImplementation(function () {
    return { getText: mockGetText, destroy: mockDestroy };
  }),
}));

import { chunkLabReport, extractPdfText, PdfExtractionError } from './pdf-extract';

beforeEach(() => {
  mockGetText.mockReset();
  mockDestroy.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('extractPdfText', () => {
  it('concatenates page text with a separator and tracks page offsets', async () => {
    // Longer than MIN_NON_WHITESPACE_CHARS so the text-layer check passes.
    const page1 =
      'MEDICHECKS ADVANCED WELL WOMAN\nPATIENT: JANE DOE  DOB: 1988-05-12\n' +
      'Sample Collected: 2026-04-01\nFerritin 42 ug/L (30-400)\n' +
      'Haemoglobin 135 g/L (130-175)\nIron 14 umol/L (10-30)\n' +
      'Transferrin saturation 19 % (20-55)';
    const page2 =
      'LIVER FUNCTION\nALT 22 U/L (10-45)\nAST 19 U/L (10-40)\n' +
      'ALP 95 U/L (30-130)\nGGT 18 U/L (<38)\n' +
      'Total bilirubin 9 umol/L (0-21)\n' +
      'Vitamin D 42 nmol/L (50-200)';
    mockGetText.mockResolvedValue({
      pages: [
        { num: 1, text: page1 },
        { num: 2, text: page2 },
      ],
      text: '',
      total: 2,
    });

    const result = await extractPdfText(Buffer.from('fake-pdf-bytes'));

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].num).toBe(1);
    expect(result.pages[0].offsetStart).toBe(0);
    expect(result.pages[0].offsetEnd).toBe(page1.length);
    expect(result.pages[1].offsetStart).toBe(page1.length + 2); // + '\n\n'
    expect(result.text.slice(result.pages[0].offsetStart, result.pages[0].offsetEnd)).toBe(page1);
    expect(result.text.slice(result.pages[1].offsetStart, result.pages[1].offsetEnd)).toBe(page2);
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('throws PdfExtractionError("empty_document") on a PDF with zero pages', async () => {
    mockGetText.mockResolvedValue({ pages: [], text: '', total: 0 });
    await expect(extractPdfText(Buffer.from('x'))).rejects.toMatchObject({
      name: 'PdfExtractionError',
      kind: 'empty_document',
    });
  });

  it('throws PdfExtractionError("no_text_layer") when total text is <200 non-whitespace chars', async () => {
    mockGetText.mockResolvedValue({
      pages: [{ num: 1, text: 'short' }],
      text: '',
      total: 1,
    });
    await expect(extractPdfText(Buffer.from('x'))).rejects.toMatchObject({
      name: 'PdfExtractionError',
      kind: 'no_text_layer',
    });
  });

  it('wraps underlying pdf-parse errors as PdfExtractionError("malformed_pdf")', async () => {
    mockGetText.mockRejectedValue(new Error('boom: invalid xref'));
    await expect(extractPdfText(Buffer.from('x'))).rejects.toMatchObject({
      name: 'PdfExtractionError',
      kind: 'malformed_pdf',
    });
    expect(mockDestroy).toHaveBeenCalled();
  });
});

describe('chunkLabReport — layout heuristics', () => {
  it('splits on blank-line boundaries', () => {
    const text = 'Ferritin 42 ug/L\n\nHaemoglobin 135 g/L\n\nMCV 92 fL';
    const chunks = chunkLabReport([
      { num: 1, text, offsetStart: 0, offsetEnd: text.length },
    ]);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].text).toBe('Ferritin 42 ug/L');
    expect(chunks[1].text).toBe('Haemoglobin 135 g/L');
    expect(chunks[2].text).toBe('MCV 92 fL');
    // Chunk indices are monotonically increasing
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it('splits on all-caps headers inside a block and glues the header to the following lines', () => {
    const text = [
      'FULL BLOOD COUNT',
      'Haemoglobin 135 g/L',
      'MCV 92 fL',
      'IRON PANEL',
      'Ferritin 42 ug/L',
      'Iron 18 umol/L',
    ].join('\n');
    const chunks = chunkLabReport([
      { num: 1, text, offsetStart: 0, offsetEnd: text.length },
    ]);
    // Two header-led sections, each with header + 2 data lines.
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toContain('FULL BLOOD COUNT');
    expect(chunks[0].text).toContain('Haemoglobin');
    expect(chunks[0].text).toContain('MCV');
    expect(chunks[1].text).toContain('IRON PANEL');
    expect(chunks[1].text).toContain('Ferritin');
    expect(chunks[1].text).toContain('Iron');
  });

  it('preserves page numbers on each chunk', () => {
    const chunks = chunkLabReport([
      { num: 1, text: 'Ferritin 42 ug/L (30-400)\n\nHaemoglobin 135 g/L (130-175)', offsetStart: 0, offsetEnd: 58 },
      { num: 2, text: 'ALT 22 U/L (10-45)\n\nAST 19 U/L (10-40)', offsetStart: 60, offsetEnd: 98 },
    ]);
    expect(chunks.map((c) => c.pageNumber)).toEqual([1, 1, 2, 2]);
  });

  it('merges tiny fragments (<40 chars) forward into the following chunk', () => {
    const text = 'OK\n\nFerritin 42 ug/L (30-400) — first trimester';
    const chunks = chunkLabReport([
      { num: 1, text, offsetStart: 0, offsetEnd: text.length },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('OK');
    expect(chunks[0].text).toContain('Ferritin');
  });

  it('drops whitespace-only chunks', () => {
    const text = '  \n\n   \n\nFerritin 42 ug/L (30-400) — printed range';
    const chunks = chunkLabReport([
      { num: 1, text, offsetStart: 0, offsetEnd: text.length },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text.trim()).toBe('Ferritin 42 ug/L (30-400) — printed range');
  });

  it('returns absolute document-level offsets that index back into concatenated text', () => {
    const page1 = 'HEADER A\nValue one is 10.\n\nHEADER B\nValue two is 20.';
    const page2 = 'HEADER C\nValue three is 30.';
    const concat = page1 + '\n\n' + page2;
    const chunks = chunkLabReport([
      { num: 1, text: page1, offsetStart: 0, offsetEnd: page1.length },
      { num: 2, text: page2, offsetStart: page1.length + 2, offsetEnd: concat.length },
    ]);
    for (const chunk of chunks) {
      expect(concat.slice(chunk.offsetStart, chunk.offsetEnd)).toBe(chunk.text);
    }
  });

  it('returns empty array for an empty document', () => {
    expect(chunkLabReport([])).toEqual([]);
    expect(
      chunkLabReport([{ num: 1, text: '', offsetStart: 0, offsetEnd: 0 }]),
    ).toEqual([]);
  });
});
