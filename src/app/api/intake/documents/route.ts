/**
 * POST /api/intake/documents — lab document ingestion endpoint (PDF or CSV).
 *
 * Flow:
 *   1. Parse multipart/form-data (`file` field). PDF or CSV.
 *   2. Hash content for dedup. Re-upload of the same bytes short-circuits.
 *   3. Persist bytes via `storeLabDocument` — Vercel Blob (access='private')
 *      in prod/preview, local FS in dev. Returns an opaque storagePath for
 *      the audit-trail column.
 *   4. PDF: pdf-parse → page-aware text → chunk by layout heuristics.
 *      CSV: UTF-8 decode → the whole file as a single chunk (lab CSVs vary
 *      too much for a deterministic parser before a partner format exists;
 *      the LLM extraction is format-agnostic and the same trust boundary).
 *   5. Claude Opus extracts biomarkers (structured-output, Zod-validated).
 *   6. Single transaction writes SourceDocument + chunks + biomarker nodes
 *      with SUPPORTS edges (ingestExtraction handles the wiring). CSV
 *      uploads persist as kind='lab_csv'; everything downstream (graph
 *      normalization, observations, temporal chaining, review-row creation,
 *      funnel events) rides the same code path untouched.
 *   7. Promotion check: any TopicPage(status=stub) whose promotion threshold
 *      is met by the newly-written biomarkers flips to status=full and will
 *      be picked up by U8's compile worker on its next pass.
 *
 * Errors:
 *   - 400 on missing file, oversized file, or a mime that is neither PDF nor CSV
 *   - 422 on malformed/image-only PDF (no_text_layer, empty_document) or an
 *     effectively-empty CSV
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
import { llmConsentGateResponse } from '@/lib/llm/consent';
import { storeLabDocument } from '@/lib/intake/storage';
import { LLMClient } from '@/lib/llm/client';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMTransientError,
  LLMValidationError,
} from '@/lib/llm/errors';
import { ingestExtraction } from '@/lib/graph/mutations';
import { isHybridRetrievalEnabled } from '@/lib/embeddings/compat';
import type { IngestExtractionInput } from '@/lib/graph/types';
import { extractPdfText, chunkLabReport, PdfExtractionError } from '@/lib/intake/pdf-extract';
import {
  LAB_EXTRACTION_SYSTEM_PROMPT,
  ExtractedLabPanelSchema,
  buildLabExtractionPrompt,
  type ExtractedLabPanel,
} from '@/lib/intake/lab-prompts';
import { resolveBiomarker } from '@/lib/intake/biomarkers';
import { buildLabObservationGraphInputs } from '@/lib/intake/lab-observations';
import { diffLatestPanels } from '@/lib/markers/panel-diff';
import { linkTemporalSucceedsForUser } from '@/lib/markers/temporal-succeeds';
import { completeDrawForSourceDocument } from '@/lib/retest/draws';
import { createReviewForDocument } from '@/lib/review/queue';
import { writeFunnelEvent, FUNNEL_EVENTS } from '@/lib/funnel/event';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
// Lab extraction runs one LLM call with a 90 s per-attempt timeout and up
// to 3 attempts on retryable failures. A 90 s ceiling would 504 on the
// first slow attempt before the retry budget could run. Vercel Pro caps
// at 300 s.
export const maxDuration = 300;

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB — generous for a lab panel scan
// A CSV export of a lab panel is kilobytes; unlike the PDF path there is no
// chunking heuristic between the raw bytes and the extraction prompt, so a
// tighter cap keeps a pathological upload from becoming a megaprompt.
const MAX_CSV_BYTES = 1 * 1024 * 1024; // 1MB
const ALLOWED_MIME = new Set(['application/pdf', 'text/csv']);

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
      { error: `Unsupported content-type "${file.type}"; PDF or CSV only` },
      { status: 400 },
    );
  }
  const isCsv = file.type === 'text/csv';
  if (isCsv && file.size > MAX_CSV_BYTES) {
    return NextResponse.json(
      { error: `CSV exceeds ${MAX_CSV_BYTES / (1024 * 1024)}MB limit` },
      { status: 400 },
    );
  }

  // Auth + consent BEFORE reading the full file buffer. The buffer can
  // be up to MAX_PDF_BYTES (20 MB) — there's no point allocating + hashing
  // it for an unauthenticated or unconsented caller. Matches the
  // top-level gate ordering used in the other 6 LLM-bearing routes.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const consentResponse = llmConsentGateResponse(user);
  if (consentResponse) return consentResponse;

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash('sha256').update(buffer).digest('hex');

  try {
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

    let chunks: ReturnType<typeof chunkLabReport>;
    let pageCount: number | null = null;
    if (isCsv) {
      // CSV branch: no text layer to extract, no layout to chunk. Decode as
      // UTF-8 (BOM stripped — Excel exports lead with one) and hand the whole
      // file to the extraction prompt as a single chunk.
      const csvText = buffer.toString('utf8').replace(/^\uFEFF/, '');
      if (csvText.trim().length === 0) {
        console.warn(`[API] intake/documents 422 empty_document (csv) file=${file.name}`);
        return NextResponse.json(
          { error: 'No extractable content found in CSV', kind: 'empty_document' },
          { status: 422 },
        );
      }
      chunks = [{ index: 0, text: csvText, offsetStart: 0, offsetEnd: csvText.length }];
    } else {
      const extracted = await extractPdfText(buffer);
      pageCount = extracted.pages.length;
      chunks = chunkLabReport(extracted.pages);
      if (chunks.length === 0) {
        console.warn(
          `[API] intake/documents 422 no_chunks file=${file.name} pages=${extracted.pages.length} textLen=${extracted.text.length}`,
        );
        return NextResponse.json(
          { error: 'No extractable content found in PDF', kind: 'no_chunks' },
          { status: 422 },
        );
      }
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

    const storagePath = await storeLabDocument(user.id, contentHash, buffer, isCsv ? 'csv' : 'pdf');
    const capturedAt = panel.reportCollectionDate
      ? new Date(panel.reportCollectionDate)
      : new Date();

    // Dated observation instances: one per reading, parented to the concept
    // node via INSTANCE_OF, so marker history accumulates across panels
    // (longitudinal plan 2026-06-10-002 U2). The concept node's rolling
    // latestValue/latestValueAt track currency (date-guarded in the merge);
    // value/collectionDate stay the first-seen anchor.
    const observations = buildLabObservationGraphInputs(
      validBiomarkers,
      panel.reportCollectionDate,
    );

    const input: IngestExtractionInput = {
      document: {
        kind: isCsv ? 'lab_csv' : 'lab_pdf',
        sourceRef: file.name,
        contentHash,
        capturedAt,
        storagePath,
        metadata: {
          labProvider: panel.labProvider,
          sizeBytes: file.size,
          // CSV has no pages; omit rather than fake a count.
          ...(pageCount !== null ? { pageCount } : {}),
        },
      },
      chunks,
      nodes: [
        ...validBiomarkers.map((b) => {
          const readingDate = b.collectionDate ?? panel.reportCollectionDate;
          const readingAt = readingDate ? new Date(readingDate) : null;
          const latestValueAt =
            readingAt && !Number.isNaN(readingAt.getTime()) ? readingAt.toISOString() : undefined;
          return {
            type: 'biomarker' as const,
            canonicalKey: b.canonicalKey,
            displayName: b.displayName,
            attributes: {
              value: b.value,
              unit: b.unit,
              referenceRangeLow: b.referenceRangeLow,
              referenceRangeHigh: b.referenceRangeHigh,
              flaggedOutOfRange: b.flaggedOutOfRange,
              collectionDate: readingDate,
              registryKey: resolveBiomarker(b.displayName)?.canonicalKey ?? null,
              latestValue: b.value,
              ...(latestValueAt ? { latestValueAt } : {}),
            },
            supportingChunkIndices: b.supportingChunkIndices,
          };
        }),
        ...observations.nodes,
      ],
      edges: observations.edges,
    };

    const persisted = await ingestExtraction(prisma, user.id, input);

    // Pilot funnel (pilot MVP plan 2026-07-04): "result returned" fires on
    // every fresh ingest, UNCONDITIONALLY (not behind the retest flag — the
    // stage must be measurable before the loop goes live). The contentHash
    // dedup returned above for re-uploads, so this never double-counts a
    // document. writeFunnelEvent swallows its own failures.
    await writeFunnelEvent(prisma, {
      funnelId: persisted.documentId,
      userId: user.id,
      event: FUNNEL_EVENTS.RESULT_INGESTED,
      properties: { kind: input.document.kind, biomarkerCount: validBiomarkers.length },
    });

    // PR7 observability for the ingest embedding hook. The hook itself lives
    // in ingestExtraction; this confirms the production rollout path is active.
    if (isHybridRetrievalEnabled()) {
      console.log(
        `[API] intake/documents embeddings hook active (HYBRID_RETRIEVAL_ENABLED) chunks=${persisted.chunkIds.length} doc=${persisted.documentId}`,
      );
    }

    const promoted = await promoteTopics(user.id, validBiomarkers.map((b) => b.canonicalKey));

    // Temporal succession (longitudinal-trajectory plan 2026-06-30-001 U1):
    // link consecutive dated observation instances of each marker in this
    // panel with TEMPORAL_SUCCEEDS, so the trajectory is graph-native and not
    // just a query-time reassembly. Post-commit + idempotent + non-fatal, and
    // scoped to this panel's markers (the prior reading resolves from the DB).
    // Unconditional like the observation-instance writes — both endpoints are
    // lab-instance nodes, so the edge is stripped from the concept canvas; a
    // failure must never convert a successful upload into an error response.
    try {
      await linkTemporalSucceedsForUser(prisma, user.id, {
        conceptCanonicalKeys: validBiomarkers.map((b) => b.canonicalKey),
      });
    } catch (linkErr) {
      const msg = linkErr instanceof Error ? linkErr.message : String(linkErr);
      console.error(`[API] intake/documents temporal-succeeds link failed post-ingest (non-fatal): ${msg}`);
    }

    // "What changed since last test": when the longitudinal surface is on and
    // this upload is a re-test (a prior panel exists), include the diff so the
    // client can show it immediately. Flag-gated; absent otherwise (flag-off
    // upload response stays byte-for-byte the previous shape). The diff runs
    // AFTER the ingest transaction has committed, so its own failure must
    // never convert a successful upload into an error response — degrade to
    // an omitted `changes` block instead.
    let changes: Awaited<ReturnType<typeof diffLatestPanels>> | undefined;
    if (env.LONGITUDINAL_GRAPH_ENABLED === 'true') {
      try {
        changes = await diffLatestPanels(prisma, user.id);
      } catch (diffErr) {
        const msg = diffErr instanceof Error ? diffErr.message : String(diffErr);
        console.error(`[API] intake/documents panel diff failed post-ingest (non-fatal): ${msg}`);
      }
    }

    // Retest loop (Plan 2026-06-17-001): a lab panel landing IS a draw event.
    // Record/complete the draw (with same-visit dedup), attribute it, and
    // schedule the next retest. Post-commit + flag-gated + non-fatal — a draw
    // failure must never convert a successful upload into an error (same posture
    // as the panel diff above). The DRAW_COMPLETED event is fired only when a
    // new draw actually completed (not on a same-visit dedup attach).
    if (env.RETEST_LOOP_ENABLED === 'true') {
      try {
        const draw = await completeDrawForSourceDocument(prisma, user.id, persisted.documentId, capturedAt);
        if (!draw.deduped && draw.sequence !== undefined) {
          await writeFunnelEvent(prisma, {
            // Opaque per-draw funnelId (not the user's id) — keeps the funnel
            // stream pseudonymous; userId carries attribution and is nulled on
            // erasure. The draw id is a random cuid with no standing link once
            // the Draw row is deleted.
            funnelId: draw.drawId,
            userId: user.id,
            event: FUNNEL_EVENTS.DRAW_COMPLETED,
            properties: { sequence: draw.sequence, attribution: draw.attribution },
          });
        }
      } catch (drawErr) {
        const msg = drawErr instanceof Error ? drawErr.message : String(drawErr);
        console.error(`[API] intake/documents retest draw hook failed post-ingest (non-fatal): ${msg}`);
      }
    }

    // Clinician review (pilot MVP plan 2026-07-04): every ingested panel gets
    // a pending review row for the clinic queue. Post-commit + flag-gated +
    // non-fatal like the sibling hooks (an upload must never fail because
    // review bookkeeping failed); a dropped hook is surfaced by the /clinic
    // reconciliation banner (countRecentDocsWithoutReview) rather than being
    // silently invisible. Idempotent under retry via the @unique(sourceDocumentId)
    // constraint; the contentHash dedup above returns before any hook on
    // re-upload, so no duplicate reviews structurally.
    if (env.CLINICIAN_REVIEW_ENABLED === 'true') {
      try {
        await createReviewForDocument(prisma, {
          userId: user.id,
          sourceDocumentId: persisted.documentId,
          documentCapturedAt: capturedAt,
          biomarkers: validBiomarkers,
          labProvider: panel.labProvider ?? null,
          sourceRef: file.name,
        });
      } catch (reviewErr) {
        const msg = reviewErr instanceof Error ? reviewErr.message : String(reviewErr);
        console.error(`[API] intake/documents review hook failed post-ingest (non-fatal): ${msg}`);
      }
    }

    return NextResponse.json({
      documentId: persisted.documentId,
      deduped: false,
      chunkCount: persisted.chunkIds.length,
      // Count extracted markers, not persisted node rows — the ingest now
      // also writes one observation instance per dated reading.
      biomarkerCount: validBiomarkers.length,
      promotedTopics: promoted,
      ...(changes !== undefined ? { changes } : {}),
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
