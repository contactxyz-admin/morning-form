/**
 * Write-side helpers for the Health Graph.
 *
 * Dedup contract: GraphNode is upsert-by-(userId, type, canonicalKey).
 * Repeat upserts shallow-merge the `attributes` JSON without overwriting
 * existing non-null fields — first-write-wins for any given key. GraphEdge
 * is dedup-by-(userId, type, fromNodeId, toNodeId, fromChunkId), enforced
 * by the unique index on the table.
 *
 * `ingestExtraction` is the canonical multi-write entry point used by U5
 * (intake), U6 (lab PDFs), and U7 (GP record). Everything happens inside one
 * Prisma transaction — partial failure rolls the whole extraction back so the
 * user can retry without seeing half-applied state.
 */

import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  type AddEdgeInput,
  type AddNodeInput,
  type AddSourceChunkInput,
  type AddSourceDocumentInput,
  type IngestExtractionInput,
  type IngestExtractionResult,
} from './types';
import { validateAttributesForWrite } from './attributes';
import { assertEdgeEndpoints } from './edge-validation';
import type { NodeType } from './types';

type Db = PrismaClient | Prisma.TransactionClient;

function jsonOrNull(value: Record<string, unknown> | undefined): string | null {
  if (!value || Object.keys(value).length === 0) return null;
  return JSON.stringify(value);
}

function mergeAttributes(existing: string | null, incoming: Record<string, unknown> | undefined): string | null {
  if (!incoming || Object.keys(incoming).length === 0) return existing;
  let base: Record<string, unknown> = {};
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      // existing was malformed; treat as empty so we don't lose the new write.
    }
  }
  // First-write-wins: keep existing keys if already set.
  for (const [k, v] of Object.entries(incoming)) {
    if (base[k] === undefined || base[k] === null) base[k] = v;
  }
  return JSON.stringify(base);
}

export async function addSourceDocument(
  db: Db,
  userId: string,
  input: AddSourceDocumentInput,
): Promise<{ id: string; deduped: boolean }> {
  // Read-then-create under concurrency: two parallel intakes with the same
  // contentHash can both see null from findUnique and race on create. Catch
  // P2002 on the second one and return the existing row so the caller gets
  // dedup semantics instead of a 500.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (input.contentHash) {
      const existing = await db.sourceDocument.findUnique({
        where: { userId_contentHash: { userId, contentHash: input.contentHash } },
      });
      if (existing) {
        await upsertAliases(db, existing.id, input.aliases);
        return { id: existing.id, deduped: true };
      }
    }
    try {
      const created = await db.sourceDocument.create({
        data: {
          userId,
          kind: input.kind,
          sourceRef: input.sourceRef,
          contentHash: input.contentHash,
          capturedAt: input.capturedAt,
          storagePath: input.storagePath,
          metadata: jsonOrNull(input.metadata),
        },
      });
      await upsertAliases(db, created.id, input.aliases);
      return { id: created.id, deduped: false };
    } catch (err) {
      if (isUniqueViolation(err) && input.contentHash && attempt === 0) continue;
      throw err;
    }
  }
  throw new Error('addSourceDocument: unreachable');
}

async function upsertAliases(
  db: Db,
  sourceDocumentId: string,
  aliases: AddSourceDocumentInput['aliases'],
): Promise<void> {
  if (!aliases || aliases.length === 0) return;
  for (const alias of aliases) {
    // The @@unique([sourceDocumentId, system, recordId]) index dedups when
    // recordId is a real string, but Postgres treats two NULL recordIds as
    // distinct — so the DB-level unique constraint will not fire for a
    // repeated (doc, system, null) tuple. Dedup those at the app layer
    // before attempting the insert so re-imports stay idempotent.
    if (alias.recordId == null) {
      const existing = await db.sourceDocumentAlias.findFirst({
        where: { sourceDocumentId, system: alias.system, recordId: null },
      });
      if (existing) continue;
    }
    try {
      await db.sourceDocumentAlias.create({
        data: {
          sourceDocumentId,
          system: alias.system,
          recordId: alias.recordId ?? null,
          pulledAt: alias.pulledAt,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) continue; // already recorded for this (doc, system, recordId)
      throw err;
    }
  }
}

export async function addSourceChunks(
  db: Db,
  sourceDocumentId: string,
  chunks: AddSourceChunkInput[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const chunk of chunks) {
    const upserted = await db.sourceChunk.upsert({
      where: { sourceDocumentId_index: { sourceDocumentId, index: chunk.index } },
      create: {
        sourceDocumentId,
        index: chunk.index,
        text: chunk.text,
        offsetStart: chunk.offsetStart,
        offsetEnd: chunk.offsetEnd,
        pageNumber: chunk.pageNumber,
        metadata: jsonOrNull(chunk.metadata),
      },
      update: {},
    });
    ids.push(upserted.id);
  }
  return ids;
}

export async function addNode(
  db: Db,
  userId: string,
  input: AddNodeInput,
): Promise<{ id: string; created: boolean }> {
  // Validate the incoming attribute shape before any DB work. Throwing here
  // (rather than after a create/update round-trip) keeps partial writes off
  // the table and gives callers a single error to catch.
  validateAttributesForWrite(input.type, input.canonicalKey, input.attributes);

  // Try create first. If the (userId,type,canonicalKey) unique constraint
  // fires (P2002), a concurrent ingest already inserted the node — retry
  // once on the merge path. This collapses the read-modify-write race window
  // to a single failed insert.
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await db.graphNode.findUnique({
      where: { userId_type_canonicalKey: { userId, type: input.type, canonicalKey: input.canonicalKey } },
    });
    if (existing) {
      const merged = mergeAttributes(existing.attributes, input.attributes);
      await db.graphNode.update({
        where: { id: existing.id },
        data: {
          attributes: merged,
          confidence:
            input.confidence !== undefined ? Math.max(existing.confidence, input.confidence) : existing.confidence,
          // First-write-wins: an explicit `promoted: false` from a re-extraction
          // must not flip a previously-promoted node back to true (or vice-versa).
          promoted: existing.promoted,
          displayName: existing.displayName || input.displayName,
        },
      });
      return { id: existing.id, created: false };
    }
    try {
      const created = await db.graphNode.create({
        data: {
          userId,
          type: input.type,
          canonicalKey: input.canonicalKey,
          displayName: input.displayName,
          attributes: jsonOrNull(input.attributes),
          confidence: input.confidence ?? 1.0,
          promoted: input.promoted ?? true,
        },
      });
      return { id: created.id, created: true };
    } catch (err) {
      if (isUniqueViolation(err) && attempt === 0) continue; // raced — re-read on next loop
      throw err;
    }
  }
  throw new Error('addNode: unreachable');
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === 'P2002';
}

export async function addEdge(db: Db, userId: string, input: AddEdgeInput): Promise<string> {
  // T8 endpoint validation. Scope both endpoint lookups to the caller's
  // userId — `findUnique({ id })` would happily return a node owned by a
  // different user and let the edge silently cross the tenant boundary.
  // We also fail loudly when either side is missing: silently skipping
  // validation masks the upstream bug where a caller passed a stale/wrong
  // node id.
  const [fromNode, toNode] = await Promise.all([
    db.graphNode.findFirst({ where: { id: input.fromNodeId, userId }, select: { type: true } }),
    db.graphNode.findFirst({ where: { id: input.toNodeId, userId }, select: { type: true } }),
  ]);
  if (!fromNode || !toNode) {
    throw new Error(
      `addEdge: endpoint not found for user (from=${input.fromNodeId} exists=${!!fromNode}, to=${input.toNodeId} exists=${!!toNode})`,
    );
  }
  assertEdgeEndpoints(input.type, fromNode.type as NodeType, toNode.type as NodeType);

  // The unique constraint includes fromChunkId; if absent we use a composite
  // findFirst fallback so we don't double-insert structural edges.
  const existing = input.fromChunkId
    ? await db.graphEdge.findFirst({
        where: {
          userId,
          type: input.type,
          fromNodeId: input.fromNodeId,
          toNodeId: input.toNodeId,
          fromChunkId: input.fromChunkId,
        },
      })
    : await db.graphEdge.findFirst({
        where: {
          userId,
          type: input.type,
          fromNodeId: input.fromNodeId,
          toNodeId: input.toNodeId,
          fromChunkId: null,
        },
      });

  if (existing) return existing.id;

  const created = await db.graphEdge.create({
    data: {
      userId,
      type: input.type,
      fromNodeId: input.fromNodeId,
      toNodeId: input.toNodeId,
      fromChunkId: input.fromChunkId,
      fromDocumentId: input.fromDocumentId,
      weight: input.weight ?? 1.0,
      metadata: jsonOrNull(input.metadata),
    },
  });
  return created.id;
}

/**
 * Atomic write of an extraction result: source document + chunks + nodes +
 * SUPPORTS edges + associative edges. Returns the persisted ids for callers
 * that need to enqueue follow-up work (topic compile, etc.).
 *
 * Resolution rules:
 * - `nodes[i].supportingChunkIndices` references indices into `input.chunks`,
 *   not chunk ids — chunk ids don't exist before this transaction runs.
 * - `edges[i].fromCanonicalKey` / `toCanonicalKey` references node canonical
 *   keys in the same payload OR an existing graph node. If neither resolves,
 *   the edge is silently skipped (logged) so a single bad LLM reference
 *   doesn't fail the whole ingest.
 */
export async function ingestExtraction(
  client: PrismaClient,
  userId: string,
  input: IngestExtractionInput,
): Promise<IngestExtractionResult> {
  return client.$transaction(async (tx) => {
    let droppedEdges = 0;
    const { id: documentId, deduped } = await addSourceDocument(tx, userId, input.document);
    const chunkIds = deduped
      ? (await tx.sourceChunk.findMany({ where: { sourceDocumentId: documentId }, orderBy: { index: 'asc' } })).map(
          (c) => c.id,
        )
      : await addSourceChunks(tx, documentId, input.chunks);

    const nodeKeyToId = new Map<string, string>();
    const nodeIds: string[] = [];
    const edgeIds: string[] = [];

    for (const node of input.nodes) {
      const { id } = await addNode(tx, userId, node);
      nodeIds.push(id);
      nodeKeyToId.set(`${node.type}::${node.canonicalKey}`, id);

      // Provenance: SUPPORTS edges from chunks to this node.
      for (const chunkIdx of node.supportingChunkIndices ?? []) {
        const chunkId = chunkIds[chunkIdx];
        if (!chunkId) {
          droppedEdges++;
          console.warn(
            `[ingestExtraction] dropped SUPPORTS edge: chunk index ${chunkIdx} out of range (${chunkIds.length} chunks) for node ${node.type}::${node.canonicalKey}`,
          );
          continue;
        }
        const edgeId = await addEdge(tx, userId, {
          type: 'SUPPORTS',
          // SUPPORTS edges connect chunk -> node; we model that with the node
          // pair (target node, target node) and the fromChunkId carrying the
          // chunk reference. Schema requires fromNodeId/toNodeId to be set —
          // we use the target node for both sides so SUPPORTS edges are
          // discoverable via the standard subgraph query.
          fromNodeId: id,
          toNodeId: id,
          fromChunkId: chunkId,
          fromDocumentId: documentId,
        });
        edgeIds.push(edgeId);
      }
    }

    for (const edge of input.edges) {
      const fromKey = `${edge.fromType}::${edge.fromCanonicalKey}`;
      const toKey = `${edge.toType}::${edge.toCanonicalKey}`;
      let fromId = nodeKeyToId.get(fromKey);
      let toId = nodeKeyToId.get(toKey);

      if (!fromId) {
        const existing = await tx.graphNode.findUnique({
          where: { userId_type_canonicalKey: { userId, type: edge.fromType, canonicalKey: edge.fromCanonicalKey } },
        });
        if (existing) fromId = existing.id;
      }
      if (!toId) {
        const existing = await tx.graphNode.findUnique({
          where: { userId_type_canonicalKey: { userId, type: edge.toType, canonicalKey: edge.toCanonicalKey } },
        });
        if (existing) toId = existing.id;
      }
      if (!fromId || !toId) {
        droppedEdges++;
        console.warn(
          `[ingestExtraction] dropped ${edge.type} edge: unresolvable ref ${fromKey} -> ${toKey}`,
        );
        continue;
      }

      const edgeId = await addEdge(tx, userId, {
        type: edge.type,
        fromNodeId: fromId,
        toNodeId: toId,
        weight: edge.weight,
        metadata: edge.metadata,
      });
      edgeIds.push(edgeId);
    }

    // Topic stubs in the same transaction: a process crash between ingest and
    // stub creation used to leave partial state. upsert with empty update
    // preserves status=ready on previously-compiled topics.
    for (const topicKey of input.tentativeTopicStubs ?? []) {
      await tx.topicPage.upsert({
        where: { userId_topicKey: { userId, topicKey } },
        create: { userId, topicKey, status: 'stub' },
        update: {},
      });
    }

    return { documentId, chunkIds, nodeIds, edgeIds, droppedEdges };
  }, {
    // Default Prisma timeout is 5s; lab PDF ingests with N>50 nodes hit 100+
    // sequential round trips and trip P2028. 30s leaves headroom.
    timeout: 30_000,
  });
}

/**
 * Convenience: stable content-hash for an arbitrary string payload. Callers
 * use this to populate `AddSourceDocumentInput.contentHash` for dedup.
 */
export function contentHashFor(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
