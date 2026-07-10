/**
 * GET /api/clinic/reviews/[id]/source — stream the ORIGINAL lab document
 * behind a review's snapshot to the clinician.
 *
 * The sign-off must be against what the lab actually sent, not only the LLM
 * extraction: markers dropped at extraction are invisible in the snapshot,
 * so without this route an approval could stamp false assurance on a
 * mis-extracted panel.
 *
 * Storage (src/lib/intake/storage.ts): prod/preview = private Vercel Blob
 * (storagePath is the blob URL, fetchable server-side with the RW token);
 * dev = repo-relative path under uploads/. PHI: clinician-gated, no-store,
 * rendered inline.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { requireClinician } from '@/lib/review/guard';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  lab_pdf: 'application/pdf',
  lab_csv: 'text/csv',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requireClinician();
  if (!guard.ok) return guard.response;

  const review = await prisma.resultReview.findUnique({
    where: { id: params.id },
    select: { sourceDocument: { select: { storagePath: true, kind: true, sourceRef: true } } },
  });
  if (!review) {
    return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
  }
  const doc = review.sourceDocument;
  if (!doc?.storagePath) {
    return NextResponse.json(
      { error: 'No stored document for this review (deleted or pre-storage ingest).' },
      { status: 404 },
    );
  }

  const contentType = CONTENT_TYPES[doc.kind] ?? 'application/octet-stream';
  const filename = (doc.sourceRef ?? 'lab-document').replace(/[^\w.-]/g, '_');
  const headers = {
    'content-type': contentType,
    'content-disposition': `inline; filename="${filename}"`,
    'cache-control': 'no-store',
  };

  if (doc.storagePath.startsWith('http')) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'Blob storage not configured.' }, { status: 503 });
    }
    const upstream = await fetch(doc.storagePath, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!upstream.ok || !upstream.body) {
      console.error(`[clinic] source blob fetch failed (${upstream.status}) for review ${params.id}`);
      return NextResponse.json({ error: 'Stored document could not be retrieved.' }, { status: 502 });
    }
    return new Response(upstream.body, { headers });
  }

  // Dev filesystem path (uploads/<userId>/<hash>.<ext>, relative to cwd).
  // resolve+prefix check so a hand-edited storagePath can't escape uploads/.
  const uploadsRoot = path.join(process.cwd(), 'uploads');
  const abs = path.resolve(process.cwd(), doc.storagePath);
  if (!abs.startsWith(uploadsRoot + path.sep)) {
    return NextResponse.json({ error: 'Invalid storage path.' }, { status: 404 });
  }
  try {
    const buffer = await readFile(abs);
    return new Response(new Uint8Array(buffer), { headers });
  } catch {
    return NextResponse.json({ error: 'Stored document could not be read.' }, { status: 404 });
  }
}
