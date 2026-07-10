import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { put } from '@vercel/blob';

/** Upload formats the intake route accepts; drives extension + contentType. */
export type LabDocumentFormat = 'pdf' | 'csv';

const FORMAT_META: Record<LabDocumentFormat, { extension: string; contentType: string }> = {
  pdf: { extension: 'pdf', contentType: 'application/pdf' },
  csv: { extension: 'csv', contentType: 'text/csv' },
};

/**
 * Persist an uploaded lab document (PDF or CSV) and return an opaque
 * `storagePath` that downstream code writes to `SourceDocument.storagePath`.
 * The column is write-only in the current app (nothing reads the file back),
 * so the returned shape is just an audit-trail pointer — a Vercel Blob URL in
 * prod/preview, or a repo-relative dev path locally.
 *
 * Environment routing:
 *   - `BLOB_READ_WRITE_TOKEN` set → `@vercel/blob` with `access: 'private'`.
 *     Vercel auto-injects this env var on deployments linked to a Blob store.
 *     `'private'` is the PHI-safe mode: blobs are only reachable via
 *     server-side `get()` with the token, never via public URL.
 *   - Token absent → local filesystem under `process.cwd()/uploads/<userId>/`.
 *     Vercel serverless has a read-only FS outside `/tmp`, which is why the
 *     FS path only runs in dev. Presence of the token is the right discriminator
 *     here — it means a Blob store is actually attached to this runtime.
 *
 * Pathname scheme is `uploads/<userId>/<contentHash>.<ext>` for both paths, so
 * the storagePath shape is consistent across environments (prod returns the
 * full blob URL, dev returns the relative path).
 */
export async function storeLabDocument(
  userId: string,
  contentHash: string,
  buffer: Buffer,
  format: LabDocumentFormat = 'pdf',
): Promise<string> {
  const { extension, contentType } = FORMAT_META[format];
  const pathname = `uploads/${userId}/${contentHash}.${extension}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(pathname, buffer, {
      access: 'private',
      contentType,
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    return blob.url;
  }

  const dir = path.join(process.cwd(), 'uploads', userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${contentHash}.${extension}`), buffer);
  return pathname;
}
