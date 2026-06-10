/**
 * Backfill dated observation instances for biomarker concepts that predate
 * the longitudinal write contract (plan 2026-06-10-002 U8).
 *
 * Before U2, a lab upload wrote only the biomarker concept node, and
 * first-write-wins kept just the FIRST panel's value. This backfill recovers
 * that one surviving reading as an `observation` instance (value + date from
 * the concept's stored attributes), linked via INSTANCE_OF, so pre-migration
 * markers show a point on their trajectory. It cannot recover values that
 * first-write-wins already discarded — those return as the user re-uploads,
 * which now accumulates correctly.
 *
 * Provenance: the instance also receives a SUPPORTS edge copied from the
 * concept's provenance — the chunk/document whose capturedAt matches the
 * reading's date (else the earliest). This is load-bearing, not cosmetic:
 * the panel diff joins instances to panels via SUPPORTS(fromDocumentId), so
 * a backfilled instance without it would be invisible to "what changed
 * since my last test".
 *
 * Idempotent: instances key on `obs_<marker>_<yyyy_mm_dd>` and `addNode`/
 * `addEdge` upsert, so re-running is a no-op.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { addEdge, addNode } from '@/lib/graph/mutations';
import { getProvenanceForNodes, parseJsonField } from '@/lib/graph/queries';
import { observationKeyFor } from '@/lib/intake/lab-observations';
import type { ProvenanceItem } from '@/lib/graph/types';

type Db = PrismaClient | Prisma.TransactionClient;

export interface BackfillResult {
  scanned: number;
  created: number;
  skipped: number;
}

/**
 * Pick the provenance item backing a reading dated `measuredAt`: prefer a
 * document captured the same UTC day, else the earliest-captured document
 * (the anchor value came from the first panel by construction).
 */
function pickProvenance(
  items: ProvenanceItem[],
  measuredAt: string,
): ProvenanceItem | null {
  if (items.length === 0) return null;
  const readingDay = measuredAt.slice(0, 10);
  const sameDay = items.find((i) => i.capturedAt.toISOString().slice(0, 10) === readingDay);
  if (sameDay) return sameDay;
  return items.reduce((earliest, i) =>
    i.capturedAt.getTime() < earliest.capturedAt.getTime() ? i : earliest,
  );
}

/**
 * Backfill one user. Returns counts. Each concept yields at most one instance
 * (its surviving anchor reading); concepts with no value or no date are
 * skipped.
 */
export async function backfillObservationsForUser(db: Db, userId: string): Promise<BackfillResult> {
  const concepts = await db.graphNode.findMany({
    where: { userId, type: 'biomarker' },
    select: { id: true, canonicalKey: true, displayName: true, attributes: true },
  });

  // Batched provenance for all concepts (2 queries total) — the SUPPORTS
  // chunk/document pairs each instance will inherit.
  const provenanceByConcept = await getProvenanceForNodes(
    db,
    concepts.map((c) => c.id),
    userId,
  );

  let created = 0;
  let skipped = 0;

  for (const concept of concepts) {
    const attrs = parseJsonField(concept.attributes);
    const value =
      typeof attrs.value === 'number' ? attrs.value
      : typeof attrs.latestValue === 'number' ? attrs.latestValue
      : null;
    const dateStr =
      typeof attrs.collectionDate === 'string' ? attrs.collectionDate
      : typeof attrs.observedAt === 'string' ? attrs.observedAt
      : typeof attrs.latestValueAt === 'string' ? attrs.latestValueAt
      : null;
    const unit = typeof attrs.unit === 'string' ? attrs.unit : '';

    if (value === null || !dateStr) {
      skipped++;
      continue;
    }
    const key = observationKeyFor(concept.canonicalKey, dateStr);
    if (!key) {
      skipped++;
      continue;
    }
    const measuredAt = new Date(dateStr).toISOString();

    const { id: instanceId, created: nodeCreated } = await addNode(db, userId, {
      type: 'observation',
      canonicalKey: key,
      displayName: `${concept.displayName} · ${dateStr.slice(0, 10)}`,
      attributes: { value, unit, measuredAt, context: 'clinic', source: 'lab_pdf' },
      promoted: false,
    });
    // addEdge is idempotent (dedups on (type, from, to, chunk)).
    await addEdge(db, userId, {
      type: 'INSTANCE_OF',
      fromNodeId: instanceId,
      toNodeId: concept.id,
    });
    // Inherit provenance so the instance joins its panel in the diff.
    const provenance = pickProvenance(provenanceByConcept.get(concept.id) ?? [], measuredAt);
    if (provenance) {
      await addEdge(db, userId, {
        type: 'SUPPORTS',
        fromNodeId: instanceId,
        toNodeId: instanceId,
        fromChunkId: provenance.chunkId,
        fromDocumentId: provenance.documentId,
      });
    }
    if (nodeCreated) created++;
    else skipped++;
  }

  return { scanned: concepts.length, created, skipped };
}
