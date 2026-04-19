/**
 * POST /api/intake/documents — lab-PDF ingestion endpoint.
 *
 * Flow:
 *   1. Parse multipart/form-data (`file` field). PDF only for v1.
 *   2. Hash content for dedup. Re-upload of the same bytes short-circuits.
 *   3. Persist bytes via `storePdf` — Vercel Blob (access='private') in
 *      prod/preview, local FS in dev. Returns an opaque storagePath for
 *      the audit-trail column.
 *   4. pdf-parse → page-aware text → chunk by layout heuristics.
 *   5. Claude Opus extracts biomarkers (structured-output, Zod-validated).
 *   6. Single transaction writes SourceDocument + chunks + biomarker nodes
 *      with SUPPORTS edges (ingestExtraction handles the wiring).
 *   7. Promotion check: any TopicPage(status=stub) whose promotion threshold
 *      is met by the newly-written biomarkers flips to status=full and will
 *      be picked up by U8's compile worker on its next pass.
 *
 * Errors:
 *   - 400 on missing file, oversized file, or non-PDF mime
 *   - 422 on malformed/image-only PDF (no_text_layer, empty_document)
 *   - 502 on LLM failures (auth / transient / validation)
 *   - 500 on anything else
 *
 * PHI safety: error messages never include the uploaded content — only
 * `err.name` + `err.message` is logged. The extracted chunks go through the
 * prompt, but nothing else leaves the server.
 */

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { storePdf } from '@/lib/intake/storage';
import { LLMClient } from '@/lib/llm/client';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMTransientError,
  LLMValidationError,
} from '@/lib/llm/errors';
import { ingestExtraction } from '@/lib/graph/mutations';
import type { IngestExtractionInput } from '@/lib/graph/types';
import { extractPdfText, chunkLabReport, PdfExtractionError } from '@/lib/intake/pdf-extract';
import {
  LAB_EXTRACTION_SYSTEM_PROMPT,
  ExtractedLabPanelSchema,
  buildLabExtractionPrompt,
  type ExtractedLabPanel,
} from '@/lib/intake/lab-prompts';
import { resolveBiomarker } from '@/lib/intake/biomarkers';

export const dynamic = 'force-dynamic';
// Lab extraction runs one LLM call with a 90 s per-attempt timeout and up
// to 3 attempts on retryable failures. A 90 s ceiling would 504 on the
// first slow attempt before the retry budget could run. Vercel Pro caps
// at 300 s.
export const maxDuration = 300;

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB — generous for a lab panel scan
const ALLOWED_MIME = new Set(['application/pdf']);

/**
 * Inline promotion rules. U8 replaces this with a proper TopicRegistry. Each
 * topic promotes from `stub → full` when any biomarker in the listed set lands.
 */
const PROMOTION_RULES: Array<{ topicKey: string; biomarkerKeys: readonly string[] }> = [
  {
    topicKey: 'iron',
    biomarkerKeys: ['ferritin', 'iron', 'tibc', 'transferrin_saturation', 'haemoglobin'],
  },
  {
    topicKey: 'energy',
    // Low vitamin D / B12 / thyroid are common fatigue drivers.
    biomarkerKeys: ['vitamin_d', 'vitamin_b12', 'folate', 'tsh', 'free_t4', 'free_t3'],
  },
  {
    topicKey: 'sleep',
    // HPA axis, mineral/vitamin drivers, and thyroid — the lab-detectable
    // sleep drivers. Overlap with iron/energy rules is intentional: a user
    // with low ferritin has a sleep-adjacent issue too, and overlapping
    // triggers don't double-promote since each rule runs against its own
    // topicKey.
    biomarkerKeys: ['cortisol', 'magnesium', 'vitamin_d', 'ferritin', 'tsh'],
  },
];

export async function POST(req: Request) {
  let file: File;
  try {
    const form = await req.formData();
    const fileField = form.get('file');
    if (!(fileField instanceof File)) {
      return NextResponse.json({ error: 'Missing `file` field' }, { status: 400 });
    }
    file = fileField;
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid multipart body', detail: err instanceof Error ? err.message : 'parse error' },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_PDF_BYTES / (1024 * 1024)}MB limit` },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported content-type "${file.type}"; PDF only in v1` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash('sha256').update(buffer).digest('hex');

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Dedup: if this exact content is already ingested for this user, return
    // the existing document id so the UI stays idempotent.
    const existing = await prisma.sourceDocument.findUnique({
      where: { userId_contentHash: { userId: user.id, contentHash } },
      include: { _count: { select: { chunks: true } } },
    });
    if (existing) {
      return NextResponse.json({
        documentId: existing.id,
        deduped: true,
        chunkCount: existing._count.chunks,
      });
    }

    const extracted = await extractPdfText(buffer);
    const chunks = chunkLabReport(extracted.pages);
    if (chunks.length === 0) {
      console.warn(
        `[API] intake/documents 422 no_chunks file=${file.name} pages=${extracted.pages.length} textLen=${extracted.text.length}`,
      );
      return NextResponse.json(
        { error: 'No extractable content found in PDF', kind: 'no_chunks' },
        { status: 422 },
      );
    }

    const client = new LLMClient();
    const panel = await client.generate<ExtractedLabPanel>({
      prompt: buildLabExtractionPrompt({
        chunks: chunks.map((c) => ({
          index: c.index,
          text: c.text,
          pageNumber: c.pageNumber ?? null,
        })),
        fileName: file.name,
      }),
      schema: ExtractedLabPanelSchema,
      system: LAB_EXTRACTION_SYSTEM_PROMPT,
      schemaDescription: 'Flat list of biomarker measurements extracted from a UK lab report.',
      maxTokens: 4096,
      temperature: 0,
    });

    // Validate supportingChunkIndices are in range; unresolvable → drop the
    // biomarker (never persist a floating node without provenance).
    const maxChunkIndex = chunks.length - 1;
    const validBiomarkers = panel.biomarkers.filter((b) =>
      b.supportingChunkIndices.every((i) => i >= 0 && i <= maxChunkIndex),
    );

    const storagePath = await storePdf(user.id, contentHash, buffer);
    const capturedAt = panel.reportCollectionDate
      ? new Date(panel.reportCollectionDate)
      : new Date();

    const input: IngestExtractionInput = {
      document: {
        kind: 'lab_pdf',
        sourceRef: file.name,
        contentHash,
        capturedAt,
        storagePath,
        metadata: {
          labProvider: panel.labProvider,
          sizeBytes: file.size,
          pageCount: extracted.pages.length,
        },
      },
      chunks,
      nodes: validBiomarkers.map((b) => ({
        type: 'biomarker' as const,
        canonicalKey: b.canonicalKey,
        displayName: b.displayName,
        attributes: {
          value: b.value,
          unit: b.unit,
          referenceRangeLow: b.referenceRangeLow,
          referenceRangeHigh: b.referenceRangeHigh,
          flaggedOutOfRange: b.flaggedOutOfRange,
          collectionDate: b.collectionDate ?? panel.reportCollectionDate,
          registryKey: resolveBiomarker(b.displayName)?.canonicalKey ?? null,
        },
        supportingChunkIndices: b.supportingChunkIndices,
      })),
      edges: [],
    };

    const persisted = await ingestExtraction(prisma, user.id, input);
    const promoted = await promoteTopics(user.id, validBiomarkers.map((b) => b.canonicalKey));

    return NextResponse.json({
      documentId: persisted.documentId,
      deduped: false,
      chunkCount: persisted.chunkIds.length,
      biomarkerCount: persisted.nodeIds.length,
      promotedTopics: promoted,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : 'UnknownError';
    const message = err instanceof Error ? err.message : String(err);

    if (err instanceof PdfExtractionError) {
      console.warn(
        `[API] intake/documents 422 ${err.kind} detail="${err.message.slice(0, 300)}"`,
      );
      return NextResponse.json(
        { error: 'PDF extraction failed', kind: err.kind, detail: err.message },
        { status: 422 },
      );
    }
    if (
      err instanceof LLMAuthError ||
      err instanceof LLMRateLimitError ||
      err instanceof LLMTransientError ||
      err instanceof LLMValidationError
    ) {
      console.error(`[API] intake/documents LLM error: ${name}: ${message}`);
      return NextResponse.json(
        { error: 'Extraction service error', kind: err.constructor.name },
        { status: 502 },
      );
    }
    console.error(`[API] intake/documents unexpected error: ${name}: ${message}`);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function promoteTopics(userId: string, biomarkerKeys: string[]): Promise<string[]> {
  const keySet = new Set(biomarkerKeys);
  const promoted: string[] = [];

  for (const rule of PROMOTION_RULES) {
    const hasHit = rule.biomarkerKeys.some((k) => keySet.has(k));
    if (!hasHit) continue;

    const result = await prisma.topicPage.updateMany({
      where: { userId, topicKey: rule.topicKey, status: 'stub' },
      data: { status: 'full' },
    });
    if (result.count > 0) promoted.push(rule.topicKey);
  }

  return promoted;
}
