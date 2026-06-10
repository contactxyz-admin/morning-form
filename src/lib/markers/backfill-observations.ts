/**
 * Backfill dated observation instances for biomarker concepts that predate
 * the longitudinal write contract (plan 2026-06-10-002 U8).
 *
 * Before U2, a lab upload wrote only the biomarker concept node, and
 * first-write-wins kept just the FIRST panel's value. This backfill recovers
 * that one surviving reading as an `observation` instance (value + date from
 * the concept's stored attributes), linked via INSTANCE_OF, so pre-migration
 * markers show a point on their trajectory. It cannot recover values that
 * first-write-wins already discarded — those return only as the user
 * re-uploads, which now accumulates correctly.
 *
 * Idempotent: instances key on `obs_<marker>_<yyyy_mm_dd>` and `addNode`/
 * `addEdge` upsert, so re-running is a no-op.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { addEdge, addNode } from '@/lib/graph/mutations';
import { observationKeyFor } from '@/lib/intake/lab-observations';

type Db = PrismaClient | Prisma.TransactionClient;

export interface BackfillResult {
  scanned: number;
  created: number;
  skipped: number;
}

function parse(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
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

  let created = 0;
  let skipped = 0;

  for (const concept of concepts) {
    const attrs = parse(concept.attributes);
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

    const { created: nodeCreated } = await addNode(db, userId, {
      type: 'observation',
      canonicalKey: key,
      displayName: `${concept.displayName} · ${dateStr.slice(0, 10)}`,
      attributes: { value, unit, measuredAt, context: 'clinic', source: 'lab_pdf' },
      promoted: false,
    });
    // addEdge is idempotent (dedups on (type, from, to, chunk)).
    await addEdge(db, userId, {
      type: 'INSTANCE_OF',
      fromNodeId: (await db.graphNode.findUniqueOrThrow({
        where: { userId_type_canonicalKey: { userId, type: 'observation', canonicalKey: key } },
        select: { id: true },
      })).id,
      toNodeId: concept.id,
    });
    if (nodeCreated) created++;
    else skipped++;
  }

  return { scanned: concepts.length, created, skipped };
}
