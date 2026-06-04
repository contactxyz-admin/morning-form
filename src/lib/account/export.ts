/**
 * GDPR Article 15 / portability export archive assembler.
 *
 * Given a userId, builds a single ZIP buffer containing:
 *   - one JSON file per user-data domain (present even when empty — an empty
 *     domain serialises as `[]`, never a missing file, so the recipient can
 *     see "we hold nothing here" rather than guessing),
 *   - `files/` with the original uploaded PDFs fetched back from private Blob,
 *   - `manifest.json` listing every domain with its row count, explicit
 *     empties, and an `exclusions` section documenting (with reasoning) what is
 *     deliberately left out.
 *
 * Completeness is the legal requirement: every user-owned Prisma model must be
 * either exported (listed in EXPORT_DOMAIN_MODELS) or on EXCLUSIONS. The
 * structural guard test (export.test.ts) walks Prisma.dmmf and fails if a new
 * user-owned model is added without a decision here.
 *
 * Failure posture: any domain query or any blob fetch failure THROWS. We never
 * present a partial archive as complete — the caller marks the ExportRequest
 * `failed` and surfaces it in Settings (plan R7, "no silent partial archives").
 *
 * Embeddings exclusion: ICO expects intelligible data. VectorEmbedding rows are
 * opaque internal float representations of text we already export as source
 * chunk text, so they are excluded with a manifest note (plan Key Technical
 * Decisions: "Embeddings are excluded from export; source content is included").
 *
 * Zip format: no zip dependency is installed and @vercel/blob ships none, so we
 * write a minimal store-only (no compression) ZIP — a well-specified format
 * (PKWARE APPNOTE) that needs only CRC-32 + local/central headers. This avoids
 * adding a dependency for an archive that is mostly already-compressed PDFs.
 */

import { createHash } from 'node:crypto';
import { get } from '@vercel/blob';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Domain coverage decisions (the completeness contract)
// ---------------------------------------------------------------------------

/**
 * Every user-owned Prisma model whose contents are exported, keyed to the
 * model name as it appears in Prisma.dmmf. The structural completeness test
 * asserts this set ∪ EXCLUSIONS covers every user-owned model. A model
 * exported as part of another domain's bundle (e.g. PriorityMarker inside the
 * priorities domain, SourceChunk inside the record domain) is still listed
 * here so the guard sees it as covered.
 */
export const EXPORT_DOMAIN_MODELS: ReadonlySet<string> = new Set([
  'User',
  'UserPreferences',
  'AssessmentResponse',
  'StateProfile',
  'Priorities',
  'PriorityMarker',
  'PrioritiesAdjustment',
  'CheckIn',
  'ChatMessage',
  'Scribe',
  'ScribeTopicLink',
  'ScribeTool',
  'HealthConnection',
  'HealthDataPoint',
  'SharedView',
  'Suggestion',
  'SourceDocument',
  'SourceDocumentAlias',
  'SourceChunk',
  'GraphNode',
  'GraphEdge',
  'GraphNodeLayout',
  'TopicPage',
]);

export interface ExclusionEntry {
  model: string;
  reason: string;
}

/**
 * User-owned (or user-derived) models deliberately excluded from the export,
 * each with the reasoning that goes verbatim into the manifest. Adding a new
 * user-owned model without putting it here OR in EXPORT_DOMAIN_MODELS fails the
 * structural guard test — exactly the intended forcing function.
 */
export const EXCLUSIONS: readonly ExclusionEntry[] = [
  {
    model: 'VectorEmbedding',
    reason:
      'Vector embeddings are opaque internal numeric representations of text. They are not intelligible to the data subject; the underlying source text is exported instead (record.sourceChunks). Per ICO right-of-access guidance, intelligible source content is provided rather than internal technical representations.',
  },
  {
    model: 'Session',
    reason:
      'Active session tokens are credentials, not personal data of interest. Exporting them would create a security risk (token disclosure) with no portability benefit.',
  },
  {
    model: 'MagicLinkToken',
    reason:
      'Single-use sign-in credentials. Excluded as credentials — disclosure risk, no portability benefit.',
  },
  {
    model: 'MagicLinkRateLimit',
    reason:
      'Internal abuse-prevention counters keyed by salted hashes; not personal data the subject can act on.',
  },
  {
    model: 'MCPToken',
    reason: 'Long-lived API credentials for external MCP clients. Excluded as credentials.',
  },
  {
    model: 'AccountDeletionToken',
    reason: 'Single-use deletion-confirmation credentials. Excluded as credentials.',
  },
  {
    model: 'ExportRequest',
    reason:
      'Internal export-lifecycle/audit bookkeeping (status, blob path, rate-limit window). Not substantive personal data; exporting it inside an export is circular.',
  },
  {
    model: 'ScribeAudit',
    reason:
      'Internal append-only audit log of model invocations (prompts, tool calls, safety classifications) retained for operational accountability — internal audit records, not user-facing personal data.',
  },
  {
    model: 'MCPAuditEvent',
    reason: 'Internal audit log of external MCP tool calls — operational audit records, not user-facing personal data.',
  },
  {
    model: 'EmbeddingBackfillState',
    reason:
      'Internal batch-job bookkeeping for the embeddings pipeline (userId is SetNull and may already be detached). Operational state, not personal data.',
  },
  {
    model: 'RawProviderPayload',
    reason:
      'Raw, unparsed third-party provider webhook payloads retained for debugging. The intelligible, normalised form is exported as healthDataPoints; raw payloads are internal diagnostic data.',
  },
  {
    model: 'FunnelEvent',
    reason:
      'Internal product-analytics event stream (funnel step transitions). Pseudonymous behavioural telemetry retained for aggregate funnel measurement, not substantive personal data.',
  },
  {
    model: 'LandingPageVisit',
    reason:
      'Internal marketing-attribution analytics (per-minute deduped page views). Pseudonymous telemetry, not substantive personal data.',
  },
];

// ---------------------------------------------------------------------------
// Domain fetchers
// ---------------------------------------------------------------------------

export interface ManifestDomain {
  /** Stable key, also the JSON filename (without extension). */
  key: string;
  /** Number of top-level records in this domain's JSON file. */
  count: number;
  /** True when count === 0 — surfaced explicitly so empties are visible. */
  empty: boolean;
  /** Prisma models whose data lands in this domain. */
  models: string[];
}

export interface Manifest {
  generatedAt: string;
  userId: string;
  domains: ManifestDomain[];
  files: { pathname: string; sourceDocumentId: string; bytes: number }[];
  exclusions: ExclusionEntry[];
}

interface DomainResult {
  key: string;
  models: string[];
  /** The value serialised to <key>.json — always present, possibly `[]`. */
  data: unknown;
  /** Count of top-level records for the manifest. */
  count: number;
  /** Source documents needing their PDFs fetched (record domain only). */
  documentBlobs?: { sourceDocumentId: string; storagePath: string }[];
}

/**
 * Assemble every domain. Each fetch failure rejects the whole assembly — a
 * partial archive must never be presented as complete (plan R7). The order
 * here is the manifest order.
 */
async function assembleDomains(prisma: PrismaClient, userId: string): Promise<DomainResult[]> {
  const [
    account,
    preferences,
    assessment,
    stateProfile,
    priorities,
    checkIns,
    chatMessages,
    scribes,
    healthConnections,
    healthDataPoints,
    sharedViews,
    suggestions,
    sourceDocuments,
    graphNodes,
    graphEdges,
    graphNodeLayouts,
    topicPages,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.userPreferences.findUnique({ where: { userId } }),
    prisma.assessmentResponse.findUnique({ where: { userId } }),
    prisma.stateProfile.findUnique({ where: { userId } }),
    prisma.priorities.findUnique({
      where: { userId },
      include: { items: true, adjustments: true },
    }),
    prisma.checkIn.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
    prisma.chatMessage.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.scribe.findMany({
      where: { userId },
      include: { tools: true, topicLink: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.healthConnection.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.healthDataPoint.findMany({ where: { userId }, orderBy: { timestamp: 'asc' } }),
    prisma.sharedView.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.suggestion.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
    prisma.sourceDocument.findMany({
      where: { userId },
      include: { chunks: { orderBy: { index: 'asc' } }, aliases: true },
      orderBy: { capturedAt: 'asc' },
    }),
    prisma.graphNode.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.graphEdge.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.graphNodeLayout.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.topicPage.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  ]);

  // record domain: graph + source documents (chunk text included; embeddings
  // excluded — see EXCLUSIONS). Strip credential-ish token fields from health
  // connections (access/refresh tokens are not portability data).
  const sanitizedConnections = healthConnections.map((c) => {
    const { accessToken: _a, refreshToken: _r, ...rest } = c;
    return rest;
  });

  const recordPayload = {
    graphNodes,
    graphEdges,
    graphNodeLayouts,
    topicPages,
    sourceDocuments: sourceDocuments.map((doc) => ({
      ...doc,
      // chunk text is the intelligible source content we export in place of
      // the excluded vector embeddings.
      chunks: doc.chunks.map((ch) => ({
        id: ch.id,
        index: ch.index,
        text: ch.text,
        offsetStart: ch.offsetStart,
        offsetEnd: ch.offsetEnd,
        pageNumber: ch.pageNumber,
        metadata: ch.metadata,
        createdAt: ch.createdAt,
      })),
    })),
  };

  const documentBlobs = sourceDocuments
    .filter((d): d is typeof d & { storagePath: string } => Boolean(d.storagePath))
    .map((d) => ({ sourceDocumentId: d.id, storagePath: d.storagePath }));

  const recordCount =
    graphNodes.length +
    graphEdges.length +
    graphNodeLayouts.length +
    topicPages.length +
    sourceDocuments.length;

  return [
    one('account', ['User'], account ? [account] : []),
    one('preferences', ['UserPreferences'], preferences ? [preferences] : []),
    one('assessment', ['AssessmentResponse'], assessment ? [assessment] : []),
    one('stateProfile', ['StateProfile'], stateProfile ? [stateProfile] : []),
    one('priorities', ['Priorities', 'PriorityMarker', 'PrioritiesAdjustment'], priorities ? [priorities] : []),
    one('checkIns', ['CheckIn'], checkIns),
    one('chatMessages', ['ChatMessage'], chatMessages),
    one('scribes', ['Scribe', 'ScribeTopicLink', 'ScribeTool'], scribes),
    one('healthConnections', ['HealthConnection'], sanitizedConnections),
    one('healthDataPoints', ['HealthDataPoint'], healthDataPoints),
    one('sharedViews', ['SharedView'], sharedViews),
    one('suggestions', ['Suggestion'], suggestions),
    {
      key: 'record',
      models: ['GraphNode', 'GraphEdge', 'GraphNodeLayout', 'TopicPage', 'SourceDocument', 'SourceDocumentAlias', 'SourceChunk'],
      data: recordPayload,
      count: recordCount,
      documentBlobs,
    },
  ];
}

function one(key: string, models: string[], rows: unknown[]): DomainResult {
  return { key, models, data: rows, count: rows.length };
}

// ---------------------------------------------------------------------------
// Blob file fetch
// ---------------------------------------------------------------------------

interface FetchedFile {
  pathname: string;
  sourceDocumentId: string;
  bytes: Buffer;
}

/**
 * Fetch each source document's original PDF from private Blob. A null `get()`
 * (blob absent) or any error throws — we do not silently omit a file the
 * manifest would otherwise claim.
 */
async function fetchDocumentFiles(
  documentBlobs: { sourceDocumentId: string; storagePath: string }[],
): Promise<FetchedFile[]> {
  const files: FetchedFile[] = [];
  for (const { sourceDocumentId, storagePath } of documentBlobs) {
    const result = await get(storagePath, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`export: blob fetch returned no body for document ${sourceDocumentId} (${storagePath})`);
    }
    const bytes = await streamToBuffer(result.stream);
    files.push({
      pathname: `files/${sourceDocumentId}.pdf`,
      sourceDocumentId,
      bytes,
    });
  }
  return files;
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

// ---------------------------------------------------------------------------
// Top-level assembler
// ---------------------------------------------------------------------------

export interface AssembledArchive {
  zip: Buffer;
  manifest: Manifest;
}

/**
 * Build the full export archive for a user. Throws on any domain query or blob
 * fetch failure — never returns a partial archive.
 */
export async function assembleExportArchive(
  prisma: PrismaClient,
  userId: string,
): Promise<AssembledArchive> {
  const domains = await assembleDomains(prisma, userId);
  const recordDomain = domains.find((d) => d.documentBlobs);
  const files = await fetchDocumentFiles(recordDomain?.documentBlobs ?? []);

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    userId,
    domains: domains.map((d) => ({
      key: d.key,
      count: d.count,
      empty: d.count === 0,
      models: d.models,
    })),
    files: files.map((f) => ({
      pathname: f.pathname,
      sourceDocumentId: f.sourceDocumentId,
      bytes: f.bytes.length,
    })),
    exclusions: [...EXCLUSIONS],
  };

  const entries: ZipEntry[] = [];
  for (const d of domains) {
    entries.push({
      name: `${d.key}.json`,
      data: Buffer.from(JSON.stringify(d.data, null, 2), 'utf8'),
    });
  }
  entries.push({
    name: 'manifest.json',
    data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
  });
  for (const f of files) {
    entries.push({ name: f.pathname, data: f.bytes });
  }

  return { zip: buildStoreZip(entries), manifest };
}

// ---------------------------------------------------------------------------
// Minimal store-only ZIP writer (PKWARE APPNOTE, no compression)
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  data: Buffer;
}

// CRC-32 (IEEE 802.3 polynomial 0xEDB88320), table-driven.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build a ZIP archive with stored (uncompressed) entries. Returns the complete
 * archive as a Buffer. Sufficient and spec-correct for our needs; PDFs are
 * already compressed so store-only costs little.
 */
export function buildStoreZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // general purpose bit flag: UTF-8 names
    localHeader.writeUInt16LE(0, 8); // compression method: store
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18); // compressed size
    localHeader.writeUInt32LE(size, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBuf, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central dir header signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // general purpose bit flag: UTF-8
    centralHeader.writeUInt16LE(0, 10); // compression method
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attributes
    centralHeader.writeUInt32LE(0, 38); // external attributes
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + entry.data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const localDir = Buffer.concat(localParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central dir signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDir.length, 12); // central dir size
  eocd.writeUInt32LE(localDir.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localDir, centralDir, eocd]);
}

/** Stable content hash of a zip buffer — handy for tests/audit. */
export function zipDigest(zip: Buffer): string {
  return createHash('sha256').update(zip).digest('hex');
}
