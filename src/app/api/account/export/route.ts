import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { sendEmail } from '@/lib/auth/email';
import { assembleExportArchive } from '@/lib/account/export';
import { resolveAppOrigin } from '@/lib/urls';

// Multi-PDF archive assembly + blob upload can run long; Pro caps at 300s.
// Repo precedent: src/app/api/intake/submit/route.ts.
export const maxDuration = 300;

const RATE_LIMIT_MAX = 2; // non-failed export requests per user per 24h
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DOWNLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/account/export — request a complete GDPR data export.
 *
 * Flow (plan Unit 5): auth → DB-backed rate-limit + `pending` row creation in
 * ONE transaction (2 non-failed/24h; the atomic check+create closes the
 * concurrent-double-pass race) → unconditional "export requested" notice email
 * → assemble archive → upload to private Blob → mark `complete` → send
 * download-link email pointing at the in-app download proxy (never the bare
 * blob URL).
 *
 * Any assembly/upload failure marks the row `failed` with a reason and returns
 * an error — never a silent partial archive. A `failed` request does not
 * consume a rate-limit slot (it isn't counted). The download-link email is sent
 * AFTER the row is `complete`, in its own try/catch: a mailer outage logs but
 * does NOT flip a stored, complete export to failed.
 */
export async function POST(httpRequest: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // Rate limit: count non-failed requests in the trailing 24h window. Mirrors
  // the magic-link fixed-window spirit but against the ExportRequest table — a
  // failed attempt must never lock a user out of an Article 15 right.
  //
  // The count check AND the pending-row creation run inside a single
  // $transaction (mirroring checkAndIncrementRateLimits in
  // src/lib/auth/magic-link.ts) so two concurrent POSTs can never both pass
  // when only one slot remains — one of them sees the other's just-created row.
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS);
  const result = await prisma.$transaction(async (tx) => {
    const recent = await tx.exportRequest.findMany({
      where: {
        userId: user.id,
        status: { not: 'failed' },
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    if (recent.length >= RATE_LIMIT_MAX) {
      const oldest = recent[0].createdAt.getTime();
      const retryAfterMs = oldest + RATE_WINDOW_MS - Date.now();
      const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
      return { limited: true as const, retryAfter };
    }
    const row = await tx.exportRequest.create({
      data: { userId: user.id, status: 'pending' },
    });
    return { limited: false as const, request: row };
  });

  if (result.limited) {
    return NextResponse.json(
      { error: 'Export rate limit reached. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
    );
  }

  const request = result.request;

  // Unconditional owner notice — fires before assembly so a hijacked-session
  // export is visible to the real account owner even if assembly later fails.
  // sendEmail may be a no-op (`sent:false`) where RESEND_API_KEY is unset.
  try {
    await sendEmail({
      to: user.email,
      subject: 'A data export was requested for your MorningForm account',
      text: [
        'A complete export of your MorningForm data was just requested.',
        '',
        "If this was you, we'll email you a secure download link shortly.",
        "If this wasn't you, please sign in and review your account security — your data has not been shared with anyone.",
      ].join('\n'),
    });
  } catch (error) {
    // The notice is best-effort accountability; do not abort the export if the
    // mailer is unavailable. Log and continue.
    console.error('[API] Export notice email failed:', error);
  }

  try {
    const { zip } = await assembleExportArchive(prisma, user.id);

    const blobPath = `uploads/${user.id}/exports/${request.id}.zip`;
    await put(blobPath, zip, {
      access: 'private',
      contentType: 'application/zip',
      addRandomSuffix: false,
      allowOverwrite: true,
      multipart: true,
    });

    const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_MS);
    await prisma.exportRequest.update({
      where: { id: request.id },
      data: { status: 'complete', blobPath, expiresAt },
    });
  } catch (error) {
    console.error('[API] Export assembly/upload failed:', error);
    const reason = error instanceof Error ? error.message : 'unknown error';
    await prisma.exportRequest
      .update({ where: { id: request.id }, data: { status: 'failed', failureReason: reason } })
      .catch(() => {});
    return NextResponse.json(
      { error: 'Export failed. Please try again.', id: request.id },
      { status: 500 },
    );
  }

  // The row is now `complete`. Send the download-link email in its OWN try/catch
  // that does NOT flip the row back to failed: the archive is built and stored,
  // and the Settings 'complete' state already tells the user to check email. A
  // mailer outage must not turn a successful export into a failure (and must not
  // be reachable by the main catch above).
  try {
    const downloadUrl = `${resolveAppOrigin(httpRequest)}/api/account/export/download?id=${request.id}`;
    await sendEmail({
      to: user.email,
      subject: 'Your MorningForm data export is ready',
      text: [
        'Your data export is ready. Use the secure link below to download it.',
        'The link expires in 24 hours and requires you to be signed in.',
        '',
        downloadUrl,
        '',
        "If you didn't request this, you can ignore this email.",
      ].join('\n'),
      html: `<p>Your data export is ready. Use the secure link below to download it. The link expires in 24 hours and requires you to be signed in.</p>
<p><a href="${downloadUrl}">${downloadUrl}</a></p>
<p style="color:#6b6b6b;font-size:13px">If you didn't request this, you can ignore this email.</p>`,
    });
  } catch (error) {
    console.error('[API] Export download-link email failed:', error);
  }

  return NextResponse.json({ status: 'complete', id: request.id });
}

/**
 * GET /api/account/export — latest export request status for the Settings UI.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const latest = await prisma.exportRequest.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      failureReason: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ request: latest });
}
