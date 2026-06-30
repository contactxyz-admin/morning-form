/**
 * Panel diff — "what changed since my last test" (longitudinal plan
 * 2026-06-10-002 U4).
 *
 * Compares a user's two most-recent lab panels (lab_pdf SourceDocuments) and
 * reports, per marker, the change between them. Instances join their panel
 * via the SUPPORTS edge written at ingest (`fromDocumentId`), and their
 * marker via INSTANCE_OF.
 *
 * Classification is strictly REFERENCE-RANGE-RELATIVE and descriptive — it
 * says whether a value moved toward or away from its reference interval, not
 * whether that is clinically good, and never names a condition or cause. In
 * the absence of a reference range it reports direction only. This keeps the
 * surface on the safe side of the May priority-markers pivot.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { parseJsonField } from '@/lib/graph/queries';
import { markerJoinKey } from './marker-key';
import { classifyChange, distanceToRange } from './classify-change';
import type { ChangeDirection, ChangeClassification } from './classify-change';

// Re-exported for back-compat: the pure classifier + its types now live in
// `classify-change.ts` (Prisma-free) so the demo can bundle them too. Existing
// `from '.../panel-diff'` importers keep working.
export { classifyChange, distanceToRange };
export type { ChangeDirection, ChangeClassification };

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * How many recent lab documents to scan when looking for the two most
 * recent panels that actually carry dated readings. Bounded so a pathological
 * upload history can't turn the diff into a full-table walk.
 */
const MAX_PANEL_SCAN = 12;

export interface MarkerChange {
  marker: string;
  /**
   * The marker's canonical join key (registryKey ?? canonicalKey, lowercased)
   * — the stable identity callers use to map a change back onto its graph
   * concept node without re-matching on the display name (plan 2026-06-10-003).
   */
  joinKey: string;
  unit: string;
  beforeValue: number | null;
  beforeAt: string | null;
  afterValue: number;
  afterAt: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  direction: ChangeDirection | null; // null for `new`
  classification: ChangeClassification;
}

export interface PanelDiff {
  latestPanelAt: string;
  previousPanelAt: string | null;
  changes: MarkerChange[];
}

interface InstanceRow {
  marker: string;
  unit: string;
  value: number;
  measuredAt: string;
  referenceLow: number | null;
  referenceHigh: number | null;
}

/**
 * Build the diff between the user's two most-recent lab panels THAT CARRY
 * dated readings. Panels without instances (undated extractions, pre-feature
 * uploads that were never backfilled) are skipped rather than allowed to
 * blank the comparison — an instance-less newest doc must not hide two
 * perfectly comparable panels beneath it. Returns `previousPanelAt: null`
 * (and `new` rows) when only one reading-bearing panel exists, and null when
 * none do.
 */
export async function diffLatestPanels(db: Db, userId: string): Promise<PanelDiff | null> {
  const docs = await db.sourceDocument.findMany({
    where: { userId, kind: 'lab_pdf' },
    orderBy: { capturedAt: 'desc' },
    take: MAX_PANEL_SCAN,
    select: { id: true, capturedAt: true },
  });
  if (docs.length === 0) return null;

  // Walk newest-first, keeping the first two docs whose instance map is
  // non-empty. Batched so the common case (the two newest docs both have
  // readings) resolves in one parallel round.
  const panels: Array<{ capturedAt: Date; readings: Map<string, InstanceRow> }> = [];
  let cursor = 0;
  while (cursor < docs.length && panels.length < 2) {
    const batch = docs.slice(cursor, cursor + (2 - panels.length));
    const maps = await Promise.all(
      batch.map((d) => loadPanelInstances(db, userId, d.id)),
    );
    batch.forEach((d, i) => {
      if (maps[i].size > 0) panels.push({ capturedAt: d.capturedAt, readings: maps[i] });
    });
    cursor += batch.length;
  }
  if (panels.length === 0) return null;

  const latest = panels[0];
  const previous = panels[1] ?? null;
  const previousReadings = previous?.readings ?? new Map<string, InstanceRow>();

  return {
    latestPanelAt: latest.capturedAt.toISOString(),
    previousPanelAt: previous ? previous.capturedAt.toISOString() : null,
    changes: buildPanelChanges(latest.readings, previousReadings),
  };
}

/**
 * Diff two SPECIFIC lab panels by document id (longitudinal-trajectory plan
 * 2026-06-30-001 U6). Reports the change in the `to` panel relative to `from`
 * (so `from` is the earlier baseline). Both docs are validated to belong to
 * the caller and to be lab panels; returns null when either is missing, not
 * owned, or not a `lab_pdf` (the route maps that to a 404). Reuses the same
 * pure classifier + instance loader as `diffLatestPanels`, so classification
 * semantics are identical.
 */
export async function diffPanels(
  db: Db,
  userId: string,
  fromDocumentId: string,
  toDocumentId: string,
): Promise<PanelDiff | null> {
  const ids = Array.from(new Set([fromDocumentId, toDocumentId]));
  const docs = await db.sourceDocument.findMany({
    where: { userId, kind: 'lab_pdf', id: { in: ids } },
    select: { id: true, capturedAt: true },
  });
  const from = docs.find((d) => d.id === fromDocumentId);
  const to = docs.find((d) => d.id === toDocumentId);
  if (!from || !to) return null;

  const [fromReadings, toReadings] = await Promise.all([
    loadPanelInstances(db, userId, fromDocumentId),
    loadPanelInstances(db, userId, toDocumentId),
  ]);

  return {
    latestPanelAt: to.capturedAt.toISOString(),
    previousPanelAt: from.capturedAt.toISOString(),
    changes: buildPanelChanges(toReadings, fromReadings),
  };
}

/**
 * Pure per-marker diff of two reading maps: every marker in `latestReadings`
 * compared against its `previousReadings` counterpart (a marker absent from
 * the previous panel is `new`). Sorted by marker name for a deterministic,
 * readable order. Shared by `diffLatestPanels` and `diffPanels` so the two
 * never drift on classification.
 */
function buildPanelChanges(
  latestReadings: Map<string, InstanceRow>,
  previousReadings: Map<string, InstanceRow>,
): MarkerChange[] {
  const changes: MarkerChange[] = [];
  for (const [joinKey, after] of Array.from(latestReadings.entries())) {
    const before = previousReadings.get(joinKey);
    if (!before) {
      changes.push({
        marker: after.marker,
        joinKey,
        unit: after.unit,
        beforeValue: null,
        beforeAt: null,
        afterValue: after.value,
        afterAt: after.measuredAt,
        referenceLow: after.referenceLow,
        referenceHigh: after.referenceHigh,
        direction: null,
        classification: 'new',
      });
      continue;
    }
    const { direction, classification } = classifyChange(
      before.value,
      after.value,
      after.referenceLow,
      after.referenceHigh,
    );
    changes.push({
      marker: after.marker,
      joinKey,
      unit: after.unit,
      beforeValue: before.value,
      beforeAt: before.measuredAt,
      afterValue: after.value,
      afterAt: after.measuredAt,
      referenceLow: after.referenceLow,
      referenceHigh: after.referenceHigh,
      direction,
      classification,
    });
  }
  changes.sort((a, b) => a.marker.localeCompare(b.marker));
  return changes;
}

/**
 * Map of join key → the marker's reading in one panel. Joins observation
 * instances to the panel via SUPPORTS (`fromDocumentId`) and to their marker
 * concept via INSTANCE_OF, pulling the reference range off the concept.
 *
 * The join key is the concept's `registryKey` when resolved, else its
 * canonicalKey (lowercased) — NOT the displayName. Two concepts can share a
 * displayName under different canonicalKeys (registry key vs snake_case
 * fallback across uploads); the registry key reunifies them across panels.
 * When two readings in ONE panel still collide on the key (same marker
 * measured twice), the one with the most recent `measuredAt` wins
 * deterministically (instances are sorted before insertion) — mirroring the
 * trajectory's same-day dedupe.
 */
async function loadPanelInstances(
  db: Db,
  userId: string,
  documentId: string,
): Promise<Map<string, InstanceRow>> {
  // Observation instances supported by this document.
  const supports = await db.graphEdge.findMany({
    where: { userId, type: 'SUPPORTS', fromDocumentId: documentId },
    select: { fromNodeId: true },
  });
  const supportedIds = Array.from(new Set(supports.map((e) => e.fromNodeId)));
  if (supportedIds.length === 0) return new Map();

  // Instance nodes and their INSTANCE_OF edges both depend only on the
  // supported-id set — fetch in parallel. (INSTANCE_OF never originates from
  // concept nodes, so querying with the superset id list is safe.)
  const [instances, instanceOf] = await Promise.all([
    db.graphNode.findMany({
      where: { userId, id: { in: supportedIds }, type: 'observation' },
      select: { id: true, attributes: true },
    }),
    db.graphEdge.findMany({
      where: { userId, type: 'INSTANCE_OF', fromNodeId: { in: supportedIds } },
      select: { fromNodeId: true, toNodeId: true },
    }),
  ]);
  if (instances.length === 0) return new Map();

  const conceptByInstance = new Map(instanceOf.map((e) => [e.fromNodeId, e.toNodeId]));
  const conceptIds = Array.from(new Set(instanceOf.map((e) => e.toNodeId)));

  const concepts = await db.graphNode.findMany({
    where: { userId, id: { in: conceptIds }, type: 'biomarker' },
    select: { id: true, canonicalKey: true, displayName: true, attributes: true },
  });
  const conceptById = new Map(concepts.map((c) => [c.id, c]));

  // Deterministic collision order: oldest first, so the latest reading of a
  // marker within the panel is the one that survives the final set().
  const parsed = instances
    .map((inst) => {
      const attrs = parseJsonField(inst.attributes);
      const value = typeof attrs.value === 'number' ? attrs.value : null;
      const measuredAt = typeof attrs.measuredAt === 'string' ? attrs.measuredAt : null;
      if (value === null || !measuredAt) return null;
      return {
        instId: inst.id,
        value,
        measuredAt,
        unit: typeof attrs.unit === 'string' ? attrs.unit : '',
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt) || a.instId.localeCompare(b.instId));

  const out = new Map<string, InstanceRow>();
  for (const reading of parsed) {
    const conceptId = conceptByInstance.get(reading.instId);
    if (!conceptId) continue;
    const concept = conceptById.get(conceptId);
    if (!concept) continue;

    const cAttrs = parseJsonField(concept.attributes);
    const joinKey = markerJoinKey(concept.canonicalKey, cAttrs.registryKey);

    out.set(joinKey, {
      marker: concept.displayName,
      unit: reading.unit,
      value: reading.value,
      measuredAt: reading.measuredAt,
      referenceLow: typeof cAttrs.referenceRangeLow === 'number' ? cAttrs.referenceRangeLow : null,
      referenceHigh: typeof cAttrs.referenceRangeHigh === 'number' ? cAttrs.referenceRangeHigh : null,
    });
  }
  return out;
}
