/**
 * PDF text extraction + chunking for lab-report ingestion.
 *
 * Responsibilities:
 *   - `extractPdfText(buffer)` — pdf-parse text-layer extraction, returns
 *     per-page text + a concatenated document string with stable page
 *     offsets so the chunker can attach a `pageNumber` to each chunk.
 *   - `chunkLabReport(pages)` — split each page into section chunks by
 *     visual-layout heuristics (blank-line boundaries + all-caps headers).
 *
 * Image-only PDFs: pdf-parse returns empty text for pages with no text
 * layer. We raise `PdfExtractionError('no_text_layer')` when the whole
 * document has <200 non-whitespace chars. OCR fallback (tesseract.js) is
 * TODO(quality) for v2 per the plan — the cost is the ~4MB WASM runtime,
 * which is not worth shipping until we see image-only labs in the wild.
 */

import { PDFParse } from 'pdf-parse';
import type { AddSourceChunkInput } from '../graph/types';

export type PdfExtractionErrorKind =
  | 'no_text_layer'
  | 'malformed_pdf'
  | 'empty_document';

export class PdfExtractionError extends Error {
  constructor(public kind: PdfExtractionErrorKind, message: string) {
    super(message);
    this.name = 'PdfExtractionError';
  }
}

export interface ExtractedPdf {
  /** Concatenated document text (what the LLM prompt will embed). */
  text: string;
  /** Per-page text with absolute `offsetStart` into `text`. */
  pages: Array<{ num: number; text: string; offsetStart: number; offsetEnd: number }>;
}

const PAGE_SEPARATOR = '\n\n';
const MIN_NON_WHITESPACE_CHARS = 200;

export async function extractPdfText(buffer: Buffer): Promise<ExtractedPdf> {
  let parser: PDFParse;
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
  } catch (err) {
    throw new PdfExtractionError(
      'malformed_pdf',
      err instanceof Error ? err.message : String(err),
    );
  }

  try {
    const result = await parser.getText();

    if (result.pages.length === 0) {
      throw new PdfExtractionError('empty_document', 'PDF has no pages');
    }

    let cursor = 0;
    const pages: ExtractedPdf['pages'] = [];
    const parts: string[] = [];
    for (let i = 0; i < result.pages.length; i++) {
      const page = result.pages[i];
      const pageText = page.text ?? '';
      const offsetStart = cursor;
      parts.push(pageText);
      cursor += pageText.length;
      const offsetEnd = cursor;
      pages.push({ num: page.num, text: pageText, offsetStart, offsetEnd });
      if (i < result.pages.length - 1) {
        parts.push(PAGE_SEPARATOR);
        cursor += PAGE_SEPARATOR.length;
      }
    }

    const text = parts.join('');
    const nonWhitespaceChars = text.replace(/\s+/g, '').length;
    if (nonWhitespaceChars < MIN_NON_WHITESPACE_CHARS) {
      throw new PdfExtractionError(
        'no_text_layer',
        `Only ${nonWhitespaceChars} non-whitespace chars — likely image-only. OCR fallback deferred to v2.`,
      );
    }

    return { text, pages };
  } catch (err) {
    if (err instanceof PdfExtractionError) throw err;
    throw new PdfExtractionError(
      'malformed_pdf',
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * Split each page into chunks using layout heuristics:
 *   - Blank-line boundaries (`\n\s*\n`) split paragraphs/sections.
 *   - An ALL-CAPS header line (≥3 chars, ≥70% uppercase letters, ends the
 *     line) forces a split at its start and keeps the header glued to the
 *     following content.
 *
 * Tiny fragments (<`MIN_CHUNK_CHARS`) are merged *forward* into the next
 * chunk — covers "Page 1 of 5" footers, single-word section labels, and
 * other layout noise that would otherwise produce floating micro-chunks.
 * A trailing tiny fragment (nothing to merge into) is folded back into the
 * previous chunk. Empty/whitespace-only chunks are dropped.
 *
 * Indexing: chunk `index` is monotonically increasing across the document
 * (NOT per page). `offsetStart`/`offsetEnd` are absolute offsets into the
 * concatenated document text returned by `extractPdfText`.
 */
// Lab-row-aware: dense biomarker rows like "Na 141" are ~6 chars, so the
// floor is low — just enough to drain page footers ("Page 1 of 5") and
// single-token labels ("OK", "-") into the next or previous real chunk.
const MIN_CHUNK_CHARS = 5;

export function chunkLabReport(pages: ExtractedPdf['pages']): AddSourceChunkInput[] {
  const chunks: AddSourceChunkInput[] = [];

  for (const page of pages) {
    const pageChunks = splitPageIntoChunks(page.text);
    for (const local of pageChunks) {
      chunks.push({
        index: chunks.length,
        text: local.text,
        offsetStart: page.offsetStart + local.offsetStart,
        offsetEnd: page.offsetStart + local.offsetEnd,
        pageNumber: page.num,
      });
    }
  }

  return chunks;
}

interface LocalChunk {
  text: string;
  offsetStart: number;
  offsetEnd: number;
}

function splitPageIntoChunks(pageText: string): LocalChunk[] {
  if (pageText.trim().length === 0) return [];

  // First pass: split on blank-line boundaries. Capture the separator
  // length so offsets stay accurate.
  const blankBlocks = splitOnBlankLines(pageText);

  // Second pass: inside each block, split again on ALL-CAPS header lines.
  const refined: LocalChunk[] = [];
  for (const block of blankBlocks) {
    refined.push(...splitOnAllCapsHeaders(block));
  }

  // Third pass: fold tiny fragments *forward* into the next chunk. A
  // trailing tiny fragment (no next) folds backward into the previous chunk.
  const nonEmpty = refined.filter((c) => c.text.trim().length > 0);
  const merged: LocalChunk[] = [];
  let pending: LocalChunk | null = null;
  for (const chunk of nonEmpty) {
    const base: LocalChunk = pending
      ? {
          text: pageText.slice(pending.offsetStart, chunk.offsetEnd),
          offsetStart: pending.offsetStart,
          offsetEnd: chunk.offsetEnd,
        }
      : chunk;
    if (base.text.length < MIN_CHUNK_CHARS) {
      pending = base;
      continue;
    }
    merged.push(base);
    pending = null;
  }
  if (pending) {
    if (merged.length > 0) {
      const last = merged[merged.length - 1];
      last.text = pageText.slice(last.offsetStart, pending.offsetEnd);
      last.offsetEnd = pending.offsetEnd;
    } else {
      merged.push(pending);
    }
  }

  return merged;
}

function splitOnBlankLines(text: string): LocalChunk[] {
  const chunks: LocalChunk[] = [];
  const re = /\n\s*\n/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > cursor) {
      chunks.push({
        text: text.slice(cursor, match.index),
        offsetStart: cursor,
        offsetEnd: match.index,
      });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    chunks.push({ text: text.slice(cursor), offsetStart: cursor, offsetEnd: text.length });
  }
  return chunks;
}

const ALL_CAPS_HEADER_RE = /^(?=.{3,}$)[A-Z0-9 ,\-/&().]+$/;

function splitOnAllCapsHeaders(chunk: LocalChunk): LocalChunk[] {
  const lines = chunk.text.split('\n');
  if (lines.length <= 1) return [chunk];

  // Find line indices that are ALL-CAPS headers.
  const isHeader = lines.map((line) => {
    const trimmed = line.trim();
    if (!ALL_CAPS_HEADER_RE.test(trimmed)) return false;
    const letters = trimmed.replace(/[^A-Za-z]/g, '');
    if (letters.length < 3) return false;
    const upper = letters.replace(/[^A-Z]/g, '').length;
    return upper / letters.length >= 0.7;
  });

  // Build split points: start a new sub-chunk whenever we see a header
  // that is NOT the very first line of the chunk.
  const splitLineIndices: number[] = [0];
  for (let i = 1; i < lines.length; i++) {
    if (isHeader[i]) splitLineIndices.push(i);
  }
  if (splitLineIndices.length === 1) return [chunk];

  const results: LocalChunk[] = [];
  for (let i = 0; i < splitLineIndices.length; i++) {
    const start = splitLineIndices[i];
    const end = i + 1 < splitLineIndices.length ? splitLineIndices[i + 1] : lines.length;
    const segmentLines = lines.slice(start, end);
    const text = segmentLines.join('\n');

    // Compute absolute offsets by summing previous line lengths (+ 1 for \n each).
    let localOffset = 0;
    for (let j = 0; j < start; j++) localOffset += lines[j].length + 1;
    let segmentLength = 0;
    for (let j = start; j < end; j++) segmentLength += lines[j].length + (j < end - 1 ? 1 : 0);

    results.push({
      text,
      offsetStart: chunk.offsetStart + localOffset,
      offsetEnd: chunk.offsetStart + localOffset + segmentLength,
    });
  }

  return results;
}
