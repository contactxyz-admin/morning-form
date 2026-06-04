import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export const maxDuration = 300;

/**
 * GET /api/account/export/download?id=<exportRequestId> — authenticated
 * download proxy for a completed export archive (plan Unit 5).
 *
 * The emailed link points here, NOT at the bare blob URL: a capability URL to
 * a full PHI archive sitting in an inbox is the wrong threat posture, and
 * @vercel/blob 2.3.3 has no signed URLs anyway. This route requires an active
 * session, asserts ownership, checks status + expiry, then streams the zip
 * from private Blob. The raw blob path is never exposed.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing export id.' }, { status: 400 });
  }

  const exportRequest = await prisma.exportRequest.findUnique({ where: { id } });

  // 404 (not 403) on wrong owner or missing row — never leak existence of
  // another user's export.
  if (!exportRequest || exportRequest.userId !== user.id) {
    return NextResponse.json({ error: 'Export not found.' }, { status: 404 });
  }

  if (exportRequest.status !== 'complete' || !exportRequest.blobPath) {
    return NextResponse.json({ error: 'Export is not ready for download.' }, { status: 404 });
  }

  if (exportRequest.expiresAt && exportRequest.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This export link has expired.' }, { status: 410 });
  }

  const result = await get(exportRequest.blobPath, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) {
    // Blob absent despite a `complete` row (swept / cleaned). Mark stale and
    // respond 410 — never a 500.
    await prisma.exportRequest
      .update({
        where: { id: exportRequest.id },
        data: { status: 'failed', failureReason: 'archive no longer available' },
      })
      .catch(() => {});
    return NextResponse.json({ error: 'This export is no longer available.' }, { status: 410 });
  }

  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="morningform-export-${exportRequest.id}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
